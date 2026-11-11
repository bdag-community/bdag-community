# syntax=docker/dockerfile:1
#
# Production image for the BDAG Community site (Next.js App Router, standalone).
# Multi-stage: deps -> builder -> a minimal non-root runner serving server.js.
#
# Build (the NEXT_PUBLIC_* args are inlined into the client bundle at BUILD time):
#   docker compose up --build -d
# or directly:
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
#     --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=... \
#     --build-arg ASSET_STORAGE_ENVIRONMENT=development \
#     --build-arg ASSET_DELIVERY_ORIGIN=https://...cloudfront.net \
#     -t bdag-community .

# ---------- deps: install from the lockfile, cached layer ----------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm install` (not the stricter `npm ci`): the lockfile is generated on macOS
# during development, and npm's `ci` sync-check resolves platform/optional deps
# differently on Linux and rejects it. `install` honors the lockfile where it
# can while tolerating the cross-platform difference. --omit=dev is NOT used —
# the Next build needs devDependencies.
RUN npm install --no-audit --no-fund

# ---------- builder: compile the standalone server ----------
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they MUST
# be present here (passed as --build-arg). Server-only secrets are NOT baked —
# they are provided at runtime (see the runner stage / compose env_file).
# Both are OPTIONAL: without Supabase env the site serves seed news content and
# disables the contact-form persistence (graceful degradation).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG ASSET_STORAGE_ENVIRONMENT
ARG ASSET_DELIVERY_ORIGIN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    ASSET_STORAGE_ENVIRONMENT=$ASSET_STORAGE_ENVIRONMENT \
    ASSET_DELIVERY_ORIGIN=$ASSET_DELIVERY_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ---------- runner: tiny, non-root, runs the standalone server ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# `output: 'standalone'` emits a self-contained server in .next/standalone but
# does NOT include the static assets or /public — copy those alongside it.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
