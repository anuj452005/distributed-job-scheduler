FROM node:20-alpine AS builder
WORKDIR /app

# Copy lock and root package files
COPY package.json package-lock.json ./

# Copy packages' package.json files so we can cache dependency install
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/engine/package.json packages/engine/
COPY packages/handlers/package.json packages/handlers/
COPY packages/events/package.json packages/events/
COPY packages/api/package.json packages/api/

# Install dependencies for api workspace
RUN npm ci --workspace=packages/api --include=dev

# Copy source code and config
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/queue packages/queue
COPY packages/scheduler packages/scheduler
COPY packages/engine packages/engine
COPY packages/handlers packages/handlers
COPY packages/events packages/events
COPY packages/api packages/api

# Build the packages in topological order
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=packages/queue
RUN npm run build --workspace=packages/events
RUN npm run build --workspace=packages/handlers
RUN npm run build --workspace=packages/scheduler
RUN npm run build --workspace=packages/engine
RUN npm run build --workspace=packages/api

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "packages/api/dist/index.js"]
