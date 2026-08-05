-- ═══════════════════════════════════════════════════════════════════════════
-- 0061 — embeddings move to fp16
--
-- vector(1024) stores every dimension as fp32; bge-m3's normalised outputs
-- lose nothing that survives a cross-encoder rerank when kept at fp16, and
-- pgvector's halfvec halves both the TOAsted vectors (~210 MB today) and the
-- HNSW index (417 MB → ~200). At today's 53k chunks this is comfort; at the
-- millions a growing catalogue implies it is the difference between an index
-- that lives in shared_buffers and one that pages.
--
-- The rewrite plus index build takes minutes and holds an exclusive lock on
-- chunks; searches in that window queue or fall back. Runs in the deploy's
-- migrate step, before the app swap, on a beta-sized table — acceptable once.
-- ═══════════════════════════════════════════════════════════════════════════

set maintenance_work_mem = '2GB';
-- Serial build: parallel maintenance workers pass tuples through /dev/shm,
-- which inside a container is whatever shm_size says — the first run of this
-- migration died exactly there. One backend with 2 GB of local memory builds
-- 53k HNSW rows in minutes and touches no shared segment.
set max_parallel_maintenance_workers = 0;

drop index if exists chunks_embedding_idx;

alter table chunks alter column embedding type halfvec(1024);

create index chunks_embedding_idx on chunks
  using hnsw (embedding halfvec_cosine_ops);
