FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
RUN npm ci --workspace=packages/web --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=packages/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/packages/web/.next ./packages/web/.next
COPY --from=builder --chown=appuser:appgroup /app/packages/web/public ./packages/web/public
COPY --from=builder --chown=appuser:appgroup /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/packages/web/node_modules ./packages/web/node_modules

USER appuser

EXPOSE 3004
CMD ["npm", "run", "start", "--workspace=@hub-billing/web", "--", "-p", "3004"]
