FROM node:20-alpine AS builder
WORKDIR /app

# Copy lock and root package files
COPY package.json package-lock.json ./

# Copy packages' package.json files so we can cache dependency install
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/

# Install dependencies for api workspace
RUN npm ci --workspace=packages/api --include=dev

# Copy source code and config
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/api packages/api

# Build the packages
RUN npm run build --workspace=packages/api

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "packages/api/dist/index.js"]
