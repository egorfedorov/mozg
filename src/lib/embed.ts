import { env } from "@/lib/env";

/** Client for services/embed (bge-m3, 1024 dims, normalised). */

const MAX_BATCH = 64;

async function post(texts: string[], kind: "passage" | "query"): Promise<number[][]> {
  const res = await fetch(`${env.EMBED_URL}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts, kind }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`embed service ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as { vectors: number[][]; dim: number };

  if (json.dim !== env.EMBED_DIM) {
    // The chunks.embedding column is vector(1024). A model swap that changes
    // dimensions needs a migration + re-embed, so fail loudly rather than
    // writing vectors Postgres will reject one row at a time.
    throw new Error(
      `embed dim mismatch: service returned ${json.dim}, schema expects ${env.EMBED_DIM}`,
    );
  }

  return json.vectors;
}

/** Embed text that will be stored and searched over. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    out.push(...(await post(texts.slice(i, i + MAX_BATCH), "passage")));
  }
  return out;
}

/** Embed a search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await post([text], "query");
  return vector;
}

export async function embedHealthy(): Promise<boolean> {
  // Generous on purpose: the embedder is a single torch process, and a big
  // re-read wave queues enough batches that /health itself waits in line.
  // Saturated-but-alive must read as healthy — flapping the site to 503
  // because ingest is busy pages the operator for a non-event. 15s of
  // silence, tried twice, is what "actually down" looks like.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${env.EMBED_URL}/health`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
    } catch {
      // fall through to the second attempt
    }
  }
  return false;
}
