# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tui-shared/package.json ./packages/tui-shared/
COPY packages/cli/package.json ./packages/cli/
COPY backend/package.json ./backend/
RUN npm ci --omit=dev --workspace=@visual-engine/tui-shared --workspace=backend

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r vae && useradd -r -g vae -m vae
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/tui-shared ./packages/tui-shared
COPY backend ./backend
# re-link workspace packages after full source copy
RUN npm ci --omit=dev --workspace=@visual-engine/tui-shared --workspace=backend
USER vae
WORKDIR /app/backend
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=8s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/server.ts"]
