# The site's server and the pages it serves, in one small image.
#
# Built from the root of the repository:
#   docker compose -f deploy/site/docker-compose.yml up -d --build
#
# The plugin is not in this image. Nothing here is installed on anybody's
# machine: it runs on the host of mozg.sh, for the chat and the operator alone.

FROM node:20-slim AS build
WORKDIR /mozg
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Every page, in every finished language, then the server as one file.
RUN npm run build && npm run build:site

FROM node:20-slim
WORKDIR /mozg
ENV NODE_ENV=production \
    MOZG_DATA=/data \
    MOZG_TRUST_PROXY=1
COPY --from=build /mozg/dist/site-server.mjs dist/site-server.mjs
COPY --from=build /mozg/out out
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4318
VOLUME /data
# Behind a reverse proxy on the host, which forwards three paths to this port.
CMD ["node", "dist/site-server.mjs", "--host", "0.0.0.0", "--port", "4318", "--static", "out"]
