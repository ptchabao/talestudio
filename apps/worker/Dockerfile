# Build from the repo root: docker build -f apps/worker/Dockerfile .
# Debian (glibc) for the Temporal core bridge; ffmpeg for the render activity.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
WORKDIR /repo/apps/worker
CMD ["pnpm", "start"]
