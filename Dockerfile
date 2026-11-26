# One image, two processes: web (default CMD) and worker (`command: ["worker.js"]` in compose).
# Bases pinned by multi-arch index digest; raise deliberately (ADR 0007).

FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.5-distroless@sha256:3a210956422ad81cf7532e1fc1f2eb9275d6ef4c2337a9d25d530f798e80726a
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=UTC
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/dist/scripts/start-web.js ./start-web.js
COPY --from=build /src/dist/worker/index.js ./worker.js
COPY --from=build /src/drizzle ./drizzle
# ponytail: app files stay root-owned and read-only to the app; give .next/cache to the user if ISR or next/image arrive.
USER 65532:65532
EXPOSE 3000
# Entrypoint is bun (base image).
CMD ["start-web.js"]
