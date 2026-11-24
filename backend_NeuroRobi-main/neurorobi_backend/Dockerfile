FROM node:22-bookworm-slim AS build

# Native build tools are needed only for the local SQLite import dependency.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npx prisma generate --config prisma.config.ts && npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations-postgresql ./prisma/migrations-postgresql
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts/migrate.cjs ./scripts/migrate.cjs
COPY --from=build /app/scripts/bootstrap-admin.cjs ./scripts/bootstrap-admin.cjs

RUN mkdir -p /app/data/uploads && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["npm", "run", "start:railway"]
