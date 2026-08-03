# Next.js app + background worker share one image — same code, different entry
# command — so a deploy can never ship a worker built from different source
# than the web app.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Stamped into the image so a running container can be asked what it was built
# from. A deploy that silently ships a cached layer is otherwise invisible —
# the server's git says one thing and the bundle is another.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
# Fonts are fetched at build time by next/font. If the build host cannot reach
# Google Fonts the build fails loudly rather than shipping fallback type.
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3300
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# tsx runs the worker straight from TypeScript and needs ca-certificates for
# outbound TLS. libvips42 is likely unused since sharp 0.34, which ships its
# own bundled libvips — it stays only because removing it unverified risks
# breaking image processing in production.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libvips42 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.ts tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN useradd -m -u 10001 mozg && chown -R mozg:mozg /app

# The storage volume mounts here. Creating it in the image with the right owner
# is what makes a fresh install work: Docker copies this ownership into a new
# named volume, and without it the volume arrives owned by root while the app
# runs as mozg — every upload then fails with EACCES and nothing says why.
RUN mkdir -p /data/storage && chown -R mozg:mozg /data
USER mozg

EXPOSE 3300
CMD ["npm", "run", "start"]
