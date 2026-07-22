# Escape Hatch generated site — multi-stage Next.js build (EH-020 / EH-033)
# No Relay monorepo credentials are baked in. Pass runtime secrets via env
# at container start — never COPY .env files with secrets.
#
# productionSafe: false — this image is not a production-safe deploy.
# Prefer the default private media layout (premium under data/private-media).
# If a kit was generated with public_legacy, COPY of public/ may still include
# premium bytes — do not treat a successful docker build as production hardening.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Preview chassis builds without DATABASE_URL / Relay env.
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# public/ should hold public/free assets only when using the default private layout.
# data/private-media (if present) must not be world-readable via static hosting.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
