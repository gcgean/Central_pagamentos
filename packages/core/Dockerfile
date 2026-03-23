# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas os arquivos de dependências para aproveitar cache
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/

RUN npm ci --workspace=packages/core --ignore-scripts

COPY packages/core ./packages/core

RUN npm run build --workspace=packages/core

# Remove devDependencies
RUN npm prune --production --workspace=packages/core

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Usuário não-root para segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copia apenas o necessário do build
COPY --from=builder --chown=appuser:appgroup /app/packages/core/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages/core/node_modules ./packages/core/node_modules

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main"]
