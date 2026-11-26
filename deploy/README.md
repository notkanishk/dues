# Deploying Dues

Two hosts, dev and prod, each a Debian Docker LXC. Each runs the same stack from [`compose.yaml`](compose.yaml): web and worker from one image, Postgres 19, Gotenberg. Only web's port 3000 is published; the internal proxy serves it as `dues.example.org`. Real host names and addresses live in `private/DEPLOY.local.md`, never here.

Host hardening: see `deploy/host/bootstrap.sh`.

## Preparing a host (once)

1. Write `/etc/dues/host.env` (see the header of [`host/bootstrap.sh`](host/bootstrap.sh) for every key), with `IMAGE_REPO=ghcr.io/<owner>/dues`.
2. As root on the host: `bash bootstrap.sh`. It prepares the host and installs `/usr/local/sbin/dues-deploy`, the one root command CI may run.
3. Register the GitHub runner with [`host/runner.sh`](host/runner.sh). The registration token goes on stdin (usage is in the script). The runner gets the label `dues-dev` or `dues-prod`.
4. Copy `deploy/compose.yaml` to `/opt/dues/compose.yaml`.
5. Write `/opt/dues/.env` (mode 0600, root-owned) with a fresh password per host:

   ```
   POSTGRES_USER=dues
   POSTGRES_PASSWORD=<long random>
   POSTGRES_DB=dues
   DATABASE_URL=postgres://dues:<same password>@postgres:5432/dues
   ```

   The two passwords must match. Compose cannot share one value between them, because `dues-deploy` passes `--env-file .image.env`, so `.env` is never used for substitution.

6. Check: `sudo -n /usr/local/sbin/dues-deploy --check` as `runner` prints `ok: <host> <env>`.

When `compose.yaml` changes in the repo, copy it to both hosts again before the next deploy. CI does not copy it.

## How a deploy runs

A push to `main` (or a manual run of the `deploy` workflow) does this:

1. `test` runs the `ci` workflow. Nothing is built unless it passes.
2. `image` (GitHub-hosted, `main` only, manual runs included) builds the Dockerfile and pushes `ghcr.io/<owner>/dues:<commit sha>`, then passes the digest reference on.
3. `dev` (runner `dues-dev`, environment `dev`) runs `sudo -n /usr/local/sbin/dues-deploy ghcr.io/<owner>/dues@sha256:<digest>`.
4. `prod` (runner `dues-prod`, environment `prod`) does the same after dev succeeds. If the `prod` environment has required reviewers, this step waits for their approval.

`dues-deploy` writes `DUES_IMAGE=<ref>` to `/opt/dues/.image.env`, pulls, and runs `docker compose up -d --remove-orphans --wait`. A service that is not healthy fails the job. On start, web applies the Drizzle migrations and then serves. The worker starts once web is healthy.

Postgres data lives in the named volume `dues_pgdata`. A redeploy never touches it; `docker compose down -v` would delete it.

## Rolling back

Deploy an older digest. Each run's full reference (`ghcr.io/<owner>/dues@sha256:<digest>`) is the `image` job's `ref` output. The tag `ghcr.io/<owner>/dues:<commit sha>` also resolves to one, for example with `docker buildx imagetools inspect`.

- From GitHub: re-run the `dev` and `prod` jobs of the older workflow run. They reuse that run's digest.
- On the host, as `runner`: `sudo -n /usr/local/sbin/dues-deploy ghcr.io/<owner>/dues@sha256:<older digest>`.

Migrations only go forward. Rolling back past a migration needs a database restore, or a migration written to undo it.

Every deploy first takes a database copy, once Postgres is running: `/var/backups/dues/pre-deploy-<UTC time>-<digest prefix>.dump` (root only, last 14 kept). `dues-deploy` pulls the new image before it, so a registry outage fails with nothing stopped. To restore, as root in `/opt/dues`: `docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < <dump>`, then deploy the digest that matches it.

## Testing the compose file

`bun run test:compose` builds the image and brings `compose.yaml` up the way a host does, under the project name `dues-scratch-smoke` with a throwaway `.env` and web on `127.0.0.1:53000`. It checks that every service is healthy and `/api/health` is 200, then stops Postgres and checks for 503, then removes everything. With a remote `DOCKER_HOST`, forward port 53000 first (`ssh -L 53000:127.0.0.1:53000 <host>`).
