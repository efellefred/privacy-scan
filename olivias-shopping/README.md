# ✨ Olivia's Back-to-School Shopping ✨

An interactive shopping-list app converted from the "Olivia's shopping" tab of the
Google Sheets back-to-school worksheet. Single static `index.html` — no build step,
no dependencies.

## Features

- Add / edit / delete items with category, store, priority, status, budget, actual cost, date and notes
- One-tap purchased check-off (auto-fills date, uses budget as cost if none entered)
- Live stat tiles: planned budget, actual spent, money left, purchased count, items listed
- Budget-by-category breakdown with progress meters and over-budget flags
- Search, filter (category / status / priority) and sort
- Saves automatically to the browser (localStorage), with JSON export / import backup

## Deploy on Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `olivias-shopping`
3. Framework preset: **Other** (no build command, no output directory needed)
4. Deploy — Vercel serves `index.html` as a static site

Or from the CLI: `cd olivias-shopping && vercel deploy`
