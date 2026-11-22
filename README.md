# paygaurd
AI-powered procurement and invoice reconciliation platform that helps businesses prevent overpayments, detect discrepancies, and accelerate vendor settlements by intelligently validating contracts, purchase orders, and invoices. It transforms manual financial verification into a faster, smarter, and more reliable settlement workflow.

## Getting started

Requires Node 22+.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # set JWT_SECRET; the Anthropic key can also be added in Settings
npm run dev:api                          # API on http://localhost:8787 (embedded Postgres, no database to install)
npm run dev:web                          # web app on http://localhost:5173
```

Demo login: `admin@apex.test` / `admin123`. Upload the PDFs in `samples/` (contract, then PO, then invoice) to see a flag.

- `apps/api`: Hono API, Drizzle on Postgres (PGlite locally), deterministic duplicate and rate-drift checks.
- `apps/web`: React, Vite and Tailwind.
- Validation layer: `POST /api/v1/validate` with an API key returns `approve`, `review` or `block` for any invoice. See the Developers page in the app.
- Detection and the in-app agent are local rules; only reading a new PDF calls your own Anthropic key, and repeat files are cached.
