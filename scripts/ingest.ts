// Ingestion: data/<tenant>/*.md → chunks → Gemini embeddings → Postgres (pgvector).
// Runs on your laptop, so the Worker's limits (10 ms CPU, 50 outbound requests) don't apply. Phase 7 moves it into the product.
// Safe to re-run: each doc's old chunks are replaced, not duplicated.
// Run: npm run ingest
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Choose the model and size once: changing either means re-embedding every chunk.
const EMBEDDING_MODEL = "gemini-embedding-2";
const DIMENSIONS = 768;
const DATA_DIR = "data";

const dbUrl = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
const apiKey = process.env.GEMINI_API_KEY;
if (!dbUrl) throw new Error("Missing CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE in .env");
if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .dev.vars");

// Front-matter is a few "key: value" lines between --- markers. A regex is enough; no library needed.
function parseDoc(text: string, path: string) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) throw new Error(`${path}: missing front-matter`);
	const meta = Object.fromEntries(
		match[1].split(/\r?\n/).map((line) => {
			const i = line.indexOf(":");
			return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
		}),
	);
	if (!meta.title) throw new Error(`${path}: front-matter needs a title`);
	if (meta.access !== "public" && meta.access !== "restricted") {
		throw new Error(`${path}: access must be public or restricted`);
	}
	return { title: meta.title as string, access: meta.access as string, body: match[2].trim() };
}

// One request per chunk: gemini-embedding-2 merges several texts in one request into a single embedding.
// Retries rate limits (429) and server errors with exponential backoff, at most 5 times.
async function embed(text: string, attempt = 1): Promise<number[]> {
	const res = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
		{
			method: "POST",
			headers: { "x-goog-api-key": apiKey!, "Content-Type": "application/json" },
			body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: DIMENSIONS }),
		},
	);
	if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
		const waitMs = 2 ** attempt * 1000;
		console.log(`  Gemini returned ${res.status}, retrying in ${waitMs / 1000}s`);
		await new Promise((resolve) => setTimeout(resolve, waitMs));
		return embed(text, attempt + 1);
	}
	if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
	const values: number[] = (await res.json()).embedding.values;
	if (values.length !== DIMENSIONS) throw new Error(`Expected ${DIMENSIONS} dimensions, got ${values.length}`);
	return values;
}

// Markdown-aware: splits at headings and paragraphs first, so chunks follow the doc's sections.
const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", { chunkSize: 500, chunkOverlap: 100 });

// The splitter leaves a heading on its own when the section under it is too big to fit with it.
// A lone heading like "## Error codes" matches questions but answers nothing, so attach short pieces to the next one.
const MIN_CHUNK_CHARS = 100;
function mergeShortPieces(pieces: string[]): string[] {
	const merged: string[] = [];
	let carry = "";
	for (const piece of pieces) {
		const text = carry ? `${carry}\n\n${piece}` : piece;
		if (text.length < MIN_CHUNK_CHARS) {
			carry = text;
			continue;
		}
		merged.push(text);
		carry = "";
	}
	if (carry) {
		// A short piece at the very end joins the previous chunk instead.
		if (merged.length) merged[merged.length - 1] += `\n\n${carry}`;
		else merged.push(carry);
	}
	return merged;
}

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
let docCount = 0;
let chunkCount = 0;
try {
	// Only sub-folders are read (one per tenant), so data/README.md is skipped.
	for (const tenant of await readdir(DATA_DIR, { withFileTypes: true })) {
		if (!tenant.isDirectory()) continue;
		const files = (await readdir(join(DATA_DIR, tenant.name))).filter((f) => f.endsWith(".md"));
		for (const file of files) {
			const sourcePath = `${tenant.name}/${file}`;
			const { title, access, body } = parseDoc(await readFile(join(DATA_DIR, sourcePath), "utf8"), sourcePath);
			const pieces = mergeShortPieces(await splitter.splitText(body));

			// Embed first: it's the slow part and the one most likely to fail. If it fails,
			// the database still has the doc's previous version.
			const vectors: number[][] = [];
			for (const piece of pieces) {
				vectors.push(await embed(`title: ${title} | text: ${piece}`)); // document prefix; questions use a different one
			}

			// Then replace the doc's chunks in one transaction: readers see the old version or the new one, never half.
			await db.query("begin");
			try {
				const { rows } = await db.query(
					`insert into documents (tenant_id, source_path, title, access) values ($1, $2, $3, $4)
					 on conflict (tenant_id, source_path)
					 do update set title = excluded.title, access = excluded.access, updated_at = now()
					 returning id`,
					[tenant.name, sourcePath, title, access],
				);
				const documentId = rows[0].id;
				await db.query("delete from chunks where document_id = $1", [documentId]);
				for (let i = 0; i < pieces.length; i++) {
					await db.query(
						`insert into chunks (tenant_id, document_id, chunk_index, content, embedding, embedding_model)
						 values ($1, $2, $3, $4, $5, $6)`,
						[tenant.name, documentId, i, pieces[i], JSON.stringify(vectors[i]), EMBEDDING_MODEL],
					);
				}
				await db.query("commit");
			} catch (err) {
				await db.query("rollback");
				throw err;
			}
			docCount++;
			chunkCount += pieces.length;
			console.log(`${sourcePath}: ${pieces.length} chunks (${access})`);
		}
	}
} finally {
	await db.end();
}
console.log(`Done: ${docCount} docs, ${chunkCount} chunks.`);
