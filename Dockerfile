# efelle Privacy Scan — container image.
# Uses Playwright's base image, which ships Chromium + all system libraries.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: the base image already has the browsers.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=5273
EXPOSE 5273

CMD ["node", "server.js"]
