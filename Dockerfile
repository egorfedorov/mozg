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
# Fonts are fetched at build time by next/font. If the build host cannot reach
# Google Fonts the build fails loudly rather than shipping fallback type.
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3300

# sharp needs libvips at runtime; tsx runs the worker straight from TypeScript.
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
USER mozg

EXPOSE 3300
CMD ["npm", "run", "start"]
