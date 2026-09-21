# Deployment

This repo is structured as a self-hosted monorepo: the product app lives under
`apps/`, auxiliary services live under `services/`, and deployment wiring lives
under `infra/`.

## Docker Compose stack

The compose stack runs three core containers:

- `web`: nginx serving the Vite build and proxying `/api/*` to the server.
- `server`: Effect/tRPC server, SQLite migrations on startup, receipt file storage.
- `ocr`: Go + Tesseract OCR service used by receipt uploads.

```sh
cp .env.example .env
# edit PUBLIC_APP_URL, SESSION_SECRET, RESEND_* as needed

docker compose -f infra/docker/docker-compose.yml up --build
```

Open:

```text
http://localhost:8080
```

Override the host port if needed:

```sh
WEB_PORT=18443 docker compose -f infra/docker/docker-compose.yml up --build
```

## Important environment variables

For compose:

```env
PUBLIC_APP_URL=https://your-public-host.example.com
SESSION_SECRET=replace-with-a-long-random-secret
RESEND_API_KEY=...
RESEND_FROM_ADDRESS=login@example.com
WEB_PORT=8080
```

Inside compose, the server uses:

```env
DATABASE_PATH=/data/app.sqlite
RECEIPT_UPLOAD_DIR=/receipts
OCR_SERVICE_URL=http://ocr:8080/v1/receipt-ocr
```

These are already set in `infra/docker/docker-compose.yml`.

## Persistent data and backups

Compose creates named volumes:

- `sqlite-data`: SQLite database + WAL files.
- `receipt-images`: uploaded receipt images.
- `backup-data`: compressed SQLite backup snapshots when the backup profile runs.

Back up both the SQLite database and receipt images. The database tracks real
money balances.

Run the built-in SQLite backup loop with the `backup` profile:

```sh
docker compose -f infra/docker/docker-compose.yml --profile backup up -d backup
```

Configuration:

```env
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
```

Backups are written inside the `backup-data` named volume as
`app-YYYYMMDDTHHMMSSZ.sqlite.gz`. This is a local snapshot strategy for v1; if
you later want off-machine replication, add Litestream or sync the `backup-data`
volume to another host.

To make a one-off backup manually:

```sh
docker compose -f infra/docker/docker-compose.yml exec server \
  sqlite3 /data/app.sqlite ".backup '/data/backup-$(date +%F).sqlite'"
```

## Cloudflared

Point the tunnel at the `web` service/host port, not the server container
directly. nginx serves the SPA and proxies `/api`.

If cloudflared runs on the host:

```text
cloudflared -> http://localhost:8080 -> web/nginx -> server + OCR
```

If cloudflared runs inside compose, use the optional `tunnel` profile:

```env
CLOUDFLARED_TUNNEL_TOKEN=...
```

```sh
docker compose -f infra/docker/docker-compose.yml --profile tunnel up -d cloudflared
```

For remotely managed Cloudflare Zero Trust tunnels, configure the public
hostname service as:

```text
http://web:80
```

For local config-file tunnels, see `infra/cloudflared/config.example.yml`.

Set `PUBLIC_APP_URL` to the externally reachable URL so CORS and magic-link URLs
are generated correctly.
