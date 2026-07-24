# ✨ Olivia's Shopping ✨

A mobile-first web app for Olivia to manage her back-to-school shopping list and
budget from her iPhone. Converted from the "Olivia's shopping" tab of the
back-to-school Google Sheets worksheet. Pure static files — no build step.

## Phone-app experience

- Bottom tab bar (List / Budget) with a floating ＋ button, iOS-style translucent bars
- Slide-up bottom sheet for adding and editing items, with segmented chips for priority and status
- Big touch targets, safe-area (notch) support, no accidental-zoom inputs
- Installable PWA: from Safari, tap **Share → Add to Home Screen** and it opens
  full-screen with its own icon, like a native app
- Works offline after first load (service worker cache)

## Features

- Money-left summary card with spend meter, always at the top of the list
- Add / edit / delete items with category, store, priority, status, budget, actual cost, date and notes
- One-tap purchased check-off (auto-fills date, uses budget as cost if none entered)
- Search, status and category filter chips, tap-to-cycle sorting
- Budget tab: stat tiles plus budget-by-category meters with over-budget flags
- Saves automatically to the phone (localStorage), with JSON export / import backup

## Deploy on Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `olivias-shopping`
3. Framework preset: **Other** (no build command, no output directory needed)
4. Deploy — Vercel serves `index.html` as a static site

Or from the CLI: `cd olivias-shopping && vercel deploy`
