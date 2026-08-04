"""
Embedding service — bge-m3, 1024 dims, strong on Russian and English.

Local and free, which matters twice over: brains will be half-Russian, and it
removes one more paid dependency from the stack.

  POST /embed   {"texts": ["..."], "kind": "passage" | "query"}  -> {"vectors": [[...]]}
  POST /rerank  {"query": "...", "documents": [...], "top_n": N} -> {"results": [{index, score}]}
  GET  /health
"""

from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder, SentenceTransformer

MODEL_NAME = os.environ.get("EMBED_MODEL", "BAAI/bge-m3")
MAX_BATCH = int(os.environ.get("EMBED_MAX_BATCH", "64"))
RERANK_MODEL = os.environ.get("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
# Cap on documents per /rerank call — a cross-encoder scores every (query, doc)
# pair, so cost is linear in the list and the caller (search.ts) only needs the
# top of the RRF fusion rescored anyway.
RERANK_MAX_DOCS = int(os.environ.get("RERANK_MAX_DOCS", "64"))

app = FastAPI(title="mozg-embed")
_model: SentenceTransformer | None = None
_reranker: CrossEncoder | None = None


def model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


# One obvious pair. A working cross-encoder scores the first far above the
# second; a model whose classifier head was newly initialised scores both at
# roughly 0.5 in whatever order it feels like.
_SELF_TEST = [
    ("what is the capital of France", "Paris is the capital of France."),
    ("what is the capital of France", "Bananas are yellow."),
]


def reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        # Lazy, unlike the embedding model: the reranker is optional and its
        # weights sit on top of bge-m3's, so we only pay for it once reranking
        # is actually requested. A missing model dir raises here and /rerank
        # answers 503 — /embed and /health are untouched.
        model = CrossEncoder(RERANK_MODEL, max_length=512)

        # Refuse to serve a reranker that cannot tell relevant from unrelated.
        #
        # Transformers only *warns* when a checkpoint has no classifier head
        # and builds a random one, so the service would come up healthy and
        # reorder every search by noise — strictly worse than having no
        # reranker at all, and invisible unless someone reads the scores. This
        # has happened once: an embedding model's files in the reranker's
        # directory, every score ~0.5, the right answer ranked last.
        good, bad = model.predict(_SELF_TEST)
        if not good > bad + 0.05:
            raise RuntimeError(
                f"reranker at {RERANK_MODEL} failed its self-test "
                f"(relevant={good:.4f} vs unrelated={bad:.4f}) — the classifier "
                "head is probably untrained. Refusing to serve it; search falls "
                "back to RRF order."
            )

        _reranker = model
    return _reranker


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1)
    # bge-m3 needs no asymmetric prefixes, unlike e5. Kept in the contract so a
    # model swap does not become an API change.
    kind: Literal["passage", "query"] = "passage"


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    dim: int
    model: str


@app.get("/health")
def health() -> dict[str, object]:
    loaded = _model is not None
    return {
        "ok": True,
        "model": MODEL_NAME,
        "loaded": loaded,
        "dim": _model.get_sentence_embedding_dimension() if loaded else None,
        "reranker": RERANK_MODEL,
        "reranker_loaded": _reranker is not None,
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if len(req.texts) > MAX_BATCH:
        raise HTTPException(413, f"batch too large: {len(req.texts)} > {MAX_BATCH}")
    if any(not t.strip() for t in req.texts):
        raise HTTPException(400, "empty text in batch")

    m = model()
    # Normalised so cosine distance in pgvector is a plain dot product.
    vectors = m.encode(
        req.texts,
        normalize_embeddings=True,
        batch_size=min(len(req.texts), 16),
        show_progress_bar=False,
    )
    return EmbedResponse(
        vectors=[v.tolist() for v in vectors],
        dim=int(m.get_sentence_embedding_dimension()),
        model=MODEL_NAME,
    )


class RerankRequest(BaseModel):
    query: str = Field(min_length=1)
    documents: list[str] = Field(min_length=1, max_length=RERANK_MAX_DOCS)
    top_n: int | None = None


class RerankResult(BaseModel):
    index: int
    score: float


class RerankResponse(BaseModel):
    results: list[RerankResult]
    model: str


@app.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest) -> RerankResponse:
    try:
        r = reranker()
    except Exception as e:
        # Weights not fetched (or OOM on load). The caller treats 503 as "no
        # reranker" and falls back to the plain RRF ranking.
        raise HTTPException(503, f"reranker unavailable: {e}")

    scores = r.predict(
        [[req.query, d] for d in req.documents],
        show_progress_bar=False,
    )
    order = sorted(range(len(req.documents)), key=lambda i: -float(scores[i]))
    if req.top_n is not None:
        order = order[: max(0, req.top_n)]
    return RerankResponse(
        results=[RerankResult(index=i, score=float(scores[i])) for i in order],
        model=RERANK_MODEL,
    )


@app.on_event("startup")
def warm() -> None:
    # Load at boot so the first ingest is not the one paying for it.
    model()
    # The reranker must load here too, and not only for latency: lazy loading
    # happens inside FastAPI's worker thread, where torch initialises modules
    # on the meta device and then dies with "Cannot copy out of meta tensor"
    # — the same weights load fine from the main thread. Failure stays
    # non-fatal: /rerank keeps answering 503 and search falls back to RRF.
    try:
        reranker()
    except Exception as exc:  # noqa: BLE001 — degraded service beats no service
        print(f"[embed] reranker unavailable at boot: {exc}")
