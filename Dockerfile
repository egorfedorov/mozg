# Next.js app + background worker share one image — same code, different entry
# command — so a deploy can never ship a worker built from different source
# than the web app.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Runtime dependencies only. tsx and the rest of devDependencies (typescript,
# eslint, tailwind) exist to build, not to run — the worker ships as a bundled
# dist/worker/index.mjs, so they never reach the final image.
FROM node:20-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Stamped into the image so a running container can be asked what it was built
# from. A deploy that silently ships a cached layer is otherwise invisible —
# the server's git says one thing and the bundle is another.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# Compiling needs no credentials, but Next evaluates every module while
# collecting page data — including lib/env, which refuses an empty environment
# by design. These placeholders exist only in this layer; the container reads
# the real .env at runtime and validates it there, which is the moment that
# actually matters.
#
# Without them, adding an import of lib/env to any always-evaluated module
# (a layout, say) breaks the deploy while the same build passes locally, where
# a .env happens to exist.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-not-a-secret \
    NEXT_PUBLIC_APP_URL=https://mozg.sh

# Fonts are fetched at build time by next/font. If the build host cannot reach
# Google Fonts the build fails loudly rather than shipping fallback type.
RUN npm run build

# The worker and the migration runner ship as esbuild bundles (dist/), built
# from the same source tree as the web app — npm ci --omit=dev in the runtime
# stage means no tsx down there to run the TypeScript directly.
RUN npm run build:worker

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3300
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# ca-certificates is for the worker's outbound TLS. libvips42 is likely unused
# since sharp 0.34, which ships its own bundled libvips — it stays only
# because removing it unverified risks breaking image processing in
# production.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libvips42 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY package.json next.config.ts ./
# dist/migrate.mjs resolves the migration files relative to itself
# (../src/db/migrations) — only that folder is needed, not the whole src tree.
COPY src/db/migrations ./src/db/migrations

RUN useradd -m -u 10001 mozg && chown -R mozg:mozg /app

# The storage volume mounts here. Creating it in the image with the right owner
# is what makes a fresh install work: Docker copies this ownership into a new
# named volume, and without it the volume arrives owned by root while the app
# runs as mozg — every upload then fails with EACCES and nothing says why.
RUN mkdir -p /data/storage && chown -R mozg:mozg /data
USER mozg

EXPOSE 3300
CMD ["npm", "run", "start"]
