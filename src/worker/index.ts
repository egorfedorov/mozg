import { getBoss, QUEUES, scheduleMaintenance, MAINTENANCE_CRON, CONSOLIDATE_CRON, scheduleConsolidation, enqueueIngest } from "@/worker/queue";
import { query } from "@/db";
import { ingestSource, SourceBusyError } from "@/worker/ingest";
import { runExam } from "@/worker/exam";
import { runMaintenance } from "@/worker/maintenance";
import { runConsolidation } from "@/worker/consolidate";
import { embedHealthy } from "@/lib/embed";
import { env } from "@/lib/env";

/**
 * Background worker. Run alongside the web app:
 *
 *   npm run worker
 */

async function main() {
  if (!(await embedHealthy())) {
    console.warn(
      `[worker] embedding service not reachable at ${env.EMBED_URL} — ` +
        "ingest will fail until it is up (services/embed/run.sh)",
    );
  }

  const boss = await getBoss();

  // Anything left mid-flight by the last shutdown. A deploy restarts the
  // worker whenever it likes, and a source interrupted between "processing"
  // and "ready" was simply abandoned — it stayed processing forever, counted
  // as stuck by the health check, and nothing ever picked it up again.
  //
  // No age threshold on purpose: during a deploy overlap the old worker may
  // still hold a source this sweep requeues, and that is now safe — the
  // requeued job bounces off the advisory lock in ingestSource and pg-boss
  // retries it once the real run has finished.
  const orphans = await query<{ id: string; name: string | null }>(
    `update sources set status = 'queued', processing_at = null
      where status = 'processing' returning id, coalesce(original_name, url) as name`,
  );
  for (const o of orphans) await enqueueIngest(o.id);
  if (orphans.length) {
    console.log(
      `[worker] requeued ${orphans.length} source(s) interrupted by the last stop:`,
      orphans.map((o) => o.name ?? o.id).join(", "),
    );
  }

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
        if (err instanceof SourceBusyError) {
          console.log(`[ingest] ${sourceId} ${err.message}`);
        } else {
          console.error(
            `[ingest] ${sourceId} FAILED after ${Date.now() - started}ms:`,
            err instanceof Error ? err.message : err,
          );
        }
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

  await boss.work(
    QUEUES.maintenance,
    { batchSize: 1, pollingIntervalSeconds: 30 },
    async () => {
      const started = Date.now();
      try {
        const { refresh, examined } = await runMaintenance();
        console.log(
          `[maintenance] checked=${refresh.checked} unchanged=${refresh.unchanged} ` +
            `changed=${refresh.changed} failed=${refresh.failed} reexam=${examined} ` +
            `${Date.now() - started}ms`,
        );
      } catch (err) {
        console.error(
          `[maintenance] FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await scheduleMaintenance();

  await boss.work(
    QUEUES.consolidate,
    { batchSize: 1, pollingIntervalSeconds: 30 },
    async () => {
      const started = Date.now();
      try {
        const report = await runConsolidation();
        console.log(
          `[consolidate] brains=${report.brains} clusters=${report.clusters} ` +
            `merged=${report.merged} superseded=${report.superseded} ` +
            `skipped=${report.skipped} ${report.costCents.toFixed(1)}¢ ` +
            `${Date.now() - started}ms`,
        );
      } catch (err) {
        console.error(
          `[consolidate] FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await scheduleConsolidation();

  console.log(
    `[worker] up — queues: ${Object.values(QUEUES).join(", ")} ` +
      `(one job at a time per queue, maintenance ${MAINTENANCE_CRON} UTC, ` +
      `consolidation ${env.CONSOLIDATE_ENABLED ? `${CONSOLIDATE_CRON} UTC` : "off"})`,
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
