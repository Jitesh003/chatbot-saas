// One-time setup: creates LangGraph's conversation-memory tables in the `langgraph` schema.
// Supabase's public API only exposes `public`, so stored conversations stay private.
// Safe to re-run: setup() only creates what's missing.
// Run: npm run setup:memory
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const MEMORY_SCHEMA = "langgraph"; // the Worker must use the same schema name

const url = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
if (!url) throw new Error("Missing CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE in .env");

const saver = PostgresSaver.fromConnString(url, { schema: MEMORY_SCHEMA });
try {
	await saver.setup();
	console.log(`Conversation memory tables are ready in schema "${MEMORY_SCHEMA}".`);
} finally {
	await saver.end();
}
