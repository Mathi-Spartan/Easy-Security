# CA Tools — Free SSL & PKI Tools

Standalone inbound-traffic toolkit. Five free tools, no signup, nothing stored.
Design system replicated 1:1 from easysecurity.in (`--ws-*` tokens: page
`#f0f4fa`, accent `#0077b6`, Inter + JetBrains Mono).

## Tools

| Route | Tool | Backend |
|---|---|---|
| `/47-day-scanner` | 47-Day Readiness Scanner | `api/ct-scan.js` (crt.sh CT logs) |
| `/dcv-preflight` | DCV Pre-Flight Checker | `api/dcv-preflight.js` (DNS + port 80 + CAA + MX) |
| `/pqc-test` | Post-Quantum Readiness Test | `api/pqc-test.js` (live TLS probe) |
| `/chain-fixer` | Certificate Chain Fixer | `api/chain-fixer.js` (AIA-following bundle builder) |
| `/acme-audit` | ACME Readiness Audit | `api/acme-audit.js` (provider detection + commands) |

## Stack

- Vite + React 18 + react-router (SPA)
- Vercel serverless functions in `/api` (Node runtime — uses `node:dns`, `node:tls`, `node:crypto`)
- No database required. No environment variables required.

## Local dev

```bash
npm install
npm run build        # verify build passes
npx vercel dev       # runs frontend + /api functions together
```

(`npm run dev` alone runs only the frontend; the /api functions need `vercel dev`.)

## Deploy

Standard workflow: push branch → Vercel preview → approval → `merge --ff-only` to main → verify production.

Notes:
- `vercel.json` already contains the SPA rewrite and a 30s function timeout
  (crt.sh can be slow; requires a Vercel plan that allows >10s functions,
  otherwise lower `maxDuration` and expect occasional CT-scan timeouts).
- The PQC probe's direct hybrid-group test depends on the OpenSSL version in
  Vercel's Node runtime; when unsupported it degrades to inference mode
  automatically (marked in the UI).
