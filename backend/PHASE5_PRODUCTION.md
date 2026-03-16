# Phase 5: Production Cutover (CRM)

This runbook finalizes migration from development file storage to production CRM integration.

## 1) Adapter mode in production

Set your runtime profile to production and use the internal CRM adapter:

- `NODE_ENV=production`
- `CRM_ADAPTER=internal`
- `CRM_BASE_URL=https://your-crm-host`
- `CRM_API_KEY=<token>`
- Optional: `CRM_TIMEOUT=8000`

Production defaults are defined in `config/production.yaml`.

## 2) Build file DB from seeds (dev data)

From `backend`:

- `npm run seed:dev`

This creates/updates `.data/crm-dev.json`.

## 3) Dry-run migration preview

From `backend`:

- `npm run migrate:crm:internal:dry`

This validates source data and prints planned API writes without mutating production systems.

## 4) Execute migration

From `backend`:

- `CRM_BASE_URL=https://your-crm-host CRM_API_KEY=... npm run migrate:crm:internal`

Optional flags:

- `--file=/custom/path/to/crm-dev.json`
- `--continue-on-error`
- `--base-url=https://override-host`

## 5) Verify cutover

- Start backend with production adapter values.
- Check customer/funnel/call flows in UI.
- Confirm analytics and objections flow use production CRM records.

## 6) Rollback

- Switch adapter back to file mode:
  - `CRM_ADAPTER=file`
- Restart backend.

This returns reads/writes to local file-backed storage while production CRM issues are investigated.
