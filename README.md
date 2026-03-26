# Plots

Static dashboard for normalized YTD commodity and equity charts.

## Commands

- `npm run dev`: starts the Vite app using the committed dataset in `public/data/commodities.json`.
- `npm run build`: builds the frontend without reaching external data providers.
- `npm run build:data`: regenerates `public/data/commodities.json` and the raw CSV snapshots.

## Data refresh

`build:data` refreshes oil, gold and S&P 500 from Yahoo Finance, and IPSA from Banco Central de Chile.

To refresh IPSA from Banco Central, provide credentials through environment variables:

- `BCCH_USER`
- `BCCH_PASS`

Example:

```bash
BCCH_USER="your-user" BCCH_PASS="your-pass" npm run build:data
```

If any provider is unavailable, the script falls back to the committed CSV snapshots under `public/raw/` so the dataset can still be rebuilt reproducibly offline.
