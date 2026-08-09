FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY backend ./backend
RUN npm install --workspace=@visual-engine/shared --workspace=backend
WORKDIR /app/backend
CMD ["npx", "tsx", "src/server.ts"]
