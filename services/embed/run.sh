#!/usr/bin/env bash
# Run the embedding service natively (no Docker — Docker Hub is unreliable from
# some regions). First run creates a venv and downloads bge-m3 (~2.2 GB) into
# ~/.cache/huggingface.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "→ creating venv"
  python3 -m venv .venv
  ./.venv/bin/pip install --quiet --upgrade pip
  echo "→ installing deps (this takes a few minutes)"
  ./.venv/bin/pip install --quiet -r requirements.txt
fi

# Prefer the locally fetched copy — see fetch-model.sh for why we do not let
# huggingface_hub download it itself.
if [ -s "./models/bge-m3/pytorch_model.bin" ] && [ -z "${EMBED_MODEL:-}" ]; then
  export EMBED_MODEL="$(cd ./models/bge-m3 && pwd)"
  echo "→ using local model at $EMBED_MODEL"
fi

exec ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port "${EMBED_PORT:-8099}"
