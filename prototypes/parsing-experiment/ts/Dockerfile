# PROTOTYPE, throwaway
FROM oven/bun:1-debian
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
ENV NODE_PATH=/deps/node_modules
WORKDIR /work/ts
