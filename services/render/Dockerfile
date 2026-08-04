# Playwright's own image carries a matching Chromium and every system dep —
# assembling that by hand is the classic way to spend an evening on fonts.
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app
RUN npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund playwright@1.49.0
COPY server.js .

EXPOSE 8100
CMD ["node", "server.js"]
