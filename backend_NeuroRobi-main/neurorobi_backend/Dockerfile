FROM node:22-bookworm-slim

# Herramientas de compilacion para modulos nativos en Debian.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

RUN npx prisma generate
RUN npm run build

RUN mkdir -p /app/data /app/uploads && chown -R node:node /app
ENV NODE_ENV=production
USER node
EXPOSE 3001

CMD ["npm", "run", "start:prod"]
