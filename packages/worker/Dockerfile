FROM node:20-alpine AS builder
WORKDIR /app

# Copy lock and root package files
COPY package.json package-lock.json ./

# Copy packages' package.json files so we can cache dependency install
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/

# Install dependencies for worker workspace
RUN npm ci --workspace=packages/worker --include=dev

# Copy source code and config
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/worker packages/worker

# Build the packages
RUN npm run build --workspace=packages/worker

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app /app

CMD ["node", "packages/worker/dist/index.js"]
