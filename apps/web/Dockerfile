# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @talestudio/web build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
