import { getBoss, QUEUES } from "@/worker/queue";
import { ingestSource } from "@/worker/ingest";
import { runExam } from "@/worker/exam";
import { embedHealthy } from "@/lib/embed";
import { env } from "@/lib/env";

/**
 * Background worker. Run alongside the web app:
 *
 *   npm run worker
 */

const CONCURRENCY = 2;

async function main() {
  if (!(await embedHealthy())) {
    console.warn(
      `[worker] embedding service not reachable at ${env.EMBED_URL} — ` +
        "ingest will fail until it is up (services/embed/run.sh)",
    );
  }

  const boss = await getBoss();

  await boss.work(
    QUEUES.ingest,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      const { sourceId } = job.data as { sourceId: string };
      const started = Date.now();
      try {
        const result = await ingestSource(sourceId);
        console.log(
          `[ingest] ${sourceId} ${result.status} notes=${result.notes} ` +
            `${Date.now() - started}ms` +
            (result.findings?.length ? ` findings=${result.findings.length}` : ""),
        );
      } catch (err) {
        // pg-boss swallows the throw into its retry bookkeeping, so a failure
        // would otherwise leave no trace in the log at all — the worst possible
        // shape for an ops problem.
        console.error(
          `[ingest] ${sourceId} FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await boss.work(
    QUEUES.exam,
    { batchSize: 1, pollingIntervalSeconds: 5 },
    async ([job]) => {
      const { brainId } = job.data as { brainId: string };
      const started = Date.now();
      try {
        const result = await runExam(brainId);
        console.log(
          result
            ? `[exam] ${brainId} ${result.score}% (${result.passed}/${result.total}) ` +
                `${result.costCents.toFixed(1)}¢ ${Date.now() - started}ms`
            : `[exam] ${brainId} skipped — brain has no goal`,
        );
      } catch (err) {
        console.error(
          `[exam] ${brainId} FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  console.log(
    `[worker] up — queues: ${Object.values(QUEUES).join(", ")} (concurrency ${CONCURRENCY})`,
  );

  const shutdown = async (signal: string) => {
    console.log(`\n[worker] ${signal}, draining…`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
