"""
Embedding service — bge-m3, 1024 dims, strong on Russian and English.

Local and free, which matters twice over: brains will be half-Russian, and it
removes one more paid dependency from the stack.

  POST /embed  {"texts": ["..."], "kind": "passage" | "query"}  -> {"vectors": [[...]]}
  GET  /health
"""

from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get("EMBED_MODEL", "BAAI/bge-m3")
MAX_BATCH = int(os.environ.get("EMBED_MAX_BATCH", "64"))

app = FastAPI(title="mozg-embed")
_model: SentenceTransformer | None = None


def model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


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


@app.on_event("startup")
def warm() -> None:
    # Load at boot so the first ingest is not the one paying for it.
    model()
