# Imagen de la API FOEST para Render. Contexto de construccion: raiz del monorepo.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Chromium del sistema (apt) en lugar del que descarga puppeteer.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# apps/web no se construye aqui (va a Vercel); solo se necesita su package.json para resolver el lock.
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci
RUN npm run build -w packages/shared && npm run build -w apps/api
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 10000
# Render inyecta PORT (por defecto 10000); la API lo lee de process.env.
CMD ["node", "dist/server.js"]
