FROM python:3.12-slim

WORKDIR /srv

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch: the GPU build is several GB larger and this workload is a few
# hundred embeddings a minute at most.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
 && pip install --no-cache-dir -r requirements.txt

COPY main.py fetch-model.sh ./
RUN chmod +x fetch-model.sh

# Weights live in a volume, not the image: 2.2 GB in a layer makes every deploy
# slow and every registry push painful.
ENV EMBED_MODEL=/models/bge-m3
ENV DEST=/models/bge-m3

EXPOSE 8099

# Fetch on first boot if the volume is empty, then serve.
CMD ["sh", "-c", "[ -s /models/bge-m3/pytorch_model.bin ] || ./fetch-model.sh; exec uvicorn main:app --host 0.0.0.0 --port 8099"]
