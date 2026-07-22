# Escape Hatch generated site — multi-stage Next.js build (EH-020)
# No Relay monorepo credentials are baked in. Pass runtime secrets via env
# at container start — never COPY .env files with secrets.
#
# productionSafe: false — this image is not a production-safe deploy.
# COPY of public/ includes public/media when present (prototype leakage until
# EH-033 private signed delivery). Do not treat a successful docker build as
# production hardening.

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

# Includes public/media when the kit stages premium bytes there (prototype leakage).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
