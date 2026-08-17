FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4050

VOLUME ["/app/data"]
EXPOSE 4050

CMD ["node", "dist/index.js"]
