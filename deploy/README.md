# Deploying Dues

Two hosts, dev and prod, each a Debian Docker LXC. Each runs the same stack from [`compose.yaml`](compose.yaml): web and worker from one image, Postgres 19, Gotenberg. Only web's port 3000 is published; the internal proxy serves it as `dues.example.org`. Real host names and addresses live in `private/DEPLOY.local.md`, never here.

Host hardening: see `deploy/host/bootstrap.sh`.

## Preparing a host (once)

1. Write `/etc/dues/host.env` (see the header of [`host/bootstrap.sh`](host/bootstrap.sh) for every key), with `REPO_URL=https://github.com/<owner>/<repo>.git`, the only source `dues-deploy` builds.
2. As root on the host: `bash bootstrap.sh`. It prepares the host and installs `/usr/local/sbin/dues-deploy`, the one root command CI may run.
3. Register the GitHub runner with [`host/runner.sh`](host/runner.sh). The registration token goes on stdin (usage is in the script). The runner gets the label `dues-dev` or `dues-prod`.
4. Write `/opt/dues/.env` (mode 0600, root-owned) with a fresh password per host:

   ```
   POSTGRES_USER=dues
   POSTGRES_PASSWORD=<long random>
   POSTGRES_DB=dues
   DATABASE_URL=postgres://dues:<same password>@postgres:5432/dues
   ```

   The two passwords must match. Compose cannot share one value between them, because `dues-deploy` passes `--env-file .image.env`, so `.env` is never used for substitution.

5. Check: `sudo -n /usr/local/sbin/dues-deploy --check` as `runner` prints `ok: <host> <env>`.

`compose.yaml` is not copied by hand: each deploy installs the one from the commit it deploys.

## How a deploy runs

A push to `main` (or a manual run of the `deploy` workflow) does this:

1. `test` runs the `ci` workflow, which also builds the Dockerfile. Nothing deploys unless it passes.
2. `dev` (runner `dues-dev`, environment `dev`, `main` only, manual runs included) runs `sudo -n /usr/local/sbin/dues-deploy <commit>`, with the run's full 40-character commit id.
3. `prod` (runner `dues-prod`, environment `prod`) does the same with the same commit as soon as dev succeeds. No one approves it: the gates are CI, a healthy dev, and prod's own health check below. `main` is protected so that only commits whose `test` check passed land on it.

`dues-deploy`, as root in `/opt/dues`:

1. fetches `main` from `REPO_URL` and refuses any commit not on it;
2. builds `dues:<first 12 characters of the commit>` from that commit's `Dockerfile` (skipped if that build is still on the host);
3. installs that commit's `deploy/compose.yaml` as `/opt/dues/compose.yaml`, writes `DUES_IMAGE=dues:<short>` to `.image.env`, and pulls the stock images;
4. takes the pre-deploy database copy (below);
5. runs `docker compose up -d --remove-orphans --wait`, then asks `/api/health` on the host for a 200 (up to 30 seconds). If either fails, it switches straight back to the build that was running before (schema changes are additive, so that build runs on the new schema), checks its health, and fails the job. The logs of web and worker are in the job output.

The build and pulls happen while the old stack still serves, so a failure there stops nothing. On start, web applies the Drizzle migrations and then serves. The worker starts once web is healthy.

Postgres data lives in the named volume `dues_pgdata`. A redeploy never touches it; `docker compose down -v` would delete it.

Admin commands on the host run as root in `/opt/dues` and need the image file, for example `docker compose --env-file .image.env ps` or `docker compose --env-file .image.env logs web`.

## Rolling back

Deploy an older commit of `main`.

- From GitHub: re-run the `dev` and `prod` jobs of the older workflow run. They deploy that run's commit.
- On the host, as `runner`: `sudo -n /usr/local/sbin/dues-deploy <older main commit>`.

The five newest builds stay on the host, so rolling back to a recent commit skips the build. Migrations only go forward. Rolling back past a migration needs a database restore, or a migration written to undo it.

Every deploy first takes a database copy, once Postgres is running: `/var/backups/dues/pre-deploy-<UTC time>-<commit prefix>.dump` (root only, last 14 kept). `dues-deploy` builds and pulls before it, so a failed build or pull stops nothing. To restore, as root in `/opt/dues`: `docker compose --env-file .image.env exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < <dump>`, then deploy the commit that matches it.

## Testing the compose file

`bun run test:compose` builds the image and brings `compose.yaml` up the way a host does, under the project name `dues-scratch-smoke` with a throwaway `.env` and web on `127.0.0.1:53000`. It checks that every service is healthy and `/api/health` is 200, then stops Postgres and checks for 503, then removes everything. With a remote `DOCKER_HOST`, forward port 53000 first (`ssh -L 53000:127.0.0.1:53000 <host>`).
