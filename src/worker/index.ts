import { Hono } from "hono";
import { Client } from "pg";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

// Waiting doesn't use CPU time, so Cloudflare won't stop a hung call. We stop it ourselves.
const TIMEOUT_MS = 5000;

async function checkGroq(apiKey: string | undefined) {
	if (!apiKey) throw new Error("GROQ_API_KEY missing");
	const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			model: "openai/gpt-oss-20b",
			messages: [{ role: "user", content: "hi" }],
			max_completion_tokens: 32, // any successful reply proves the key and network; keep it cheap
		}),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
}

// Hono's context type differs from the Workers one; both have waitUntil, which is all we need.
async function checkDb(hyperdrive: Hyperdrive, ctx: Pick<ExecutionContext, "waitUntil">) {
	// A new client on every request: a Worker can't share a connection between requests.
	// It's cheap, because Hyperdrive keeps the real connections to Supabase open.
	const client = new Client({
		connectionString: hyperdrive.connectionString,
		connectionTimeoutMillis: TIMEOUT_MS,
		query_timeout: TIMEOUT_MS,
	});
	try {
		await client.connect();
		await client.query("select count(*) from orders");
	} finally {
		// Close after the response is sent, so the user doesn't wait for it.
		ctx.waitUntil(client.end().catch(() => {}));
	}
}

app.get("/api/health", async (c) => {
	// Run both checks at the same time: total wait = the slower one, not the sum.
	// allSettled (not all) so one failure doesn't hide the other's result.
	const [groq, db] = await Promise.allSettled([
		checkGroq(c.env.GROQ_API_KEY),
		checkDb(c.env.HYPERDRIVE, c.executionCtx),
	]);

	const status = (name: string, result: PromiseSettledResult<void>) => {
		if (result.status === "fulfilled") return "ok";
		// The details go to the Workers logs only. The public gets "error", never hostnames or stack traces.
		console.error(`health check failed: ${name}`, result.reason);
		return "error";
	};

	const body = { groq: status("groq", groq), db: status("db", db) };
	return c.json(body, body.groq === "ok" && body.db === "ok" ? 200 : 503);
});

export default app;
