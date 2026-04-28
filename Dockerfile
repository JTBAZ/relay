# Production image for the Relay API (no Nix / Nixpacks).
# Use this in Coolify when "Nixpacks" builds fail on RUN nix-env (timeout, OOM, or exit 255
# while unpacking nixpkgs on a small VPS).
# Coolify: set build pack to "Dockerfile", leave Dockerfile path = ./Dockerfile
#
# Prisma 7: prisma generate needs DATABASE_URL at build (dummy URL is fine; no real DB connect).
# -----------------------------------------------------------------------------

FROM node:24-bookworm-slim AS build

# Native addons (e.g. sharp) and Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

# Same dummy URL as nixpacks.toml — satisfies prisma.config.ts env("DATABASE_URL")
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/relay_build?schema=public"

RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev

# -----------------------------------------------------------------------------

FROM node:24-bookworm-slim AS runner

# sharp (visitor-preview, export): libvips at runtime; without it node may crash on first sharp() call
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    libvips42 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma

EXPOSE 8787

CMD ["node", "dist/src/main.js"]
