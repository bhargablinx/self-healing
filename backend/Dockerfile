FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --no-audit --no-fund --prefer-offline \
      --maxsockets=5 --fetch-retries=5 --fetch-timeout=300000
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src
# Prisma loads its config during generation, so give the build a local-only
# placeholder URL. Compose supplies the real runtime URL to the container.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate && npm run build
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
