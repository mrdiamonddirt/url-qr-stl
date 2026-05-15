# URL QR STL MVP

Ionic React MVP that:

- Takes a URL and generates a short link (`/s/:code`)
- Generates QR tags using predefined templates with editable text fields
- Converts QR data into STL files for 3D printing
- Requires sign-in (Supabase Magic Link) for STL export
- Tracks generated links and STL exports per user (with local fallback placeholders)

## Stack

- Ionic React + Vite + TypeScript
- Supabase (`@supabase/supabase-js`) for auth and optional persistence
- `qrcode` for QR rendering
- `three` + `three-stdlib` for in-browser STL generation

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy env vars:

```bash
cp .env.example .env
```

3. Fill `.env` with Supabase values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional ad monetization config (Google Ad Manager on scan-limit through page):

- `VITE_GAM_SCAN_LIMIT_AD_UNIT_PATH` (example: `/1234567/url2stl_scan_limit`)
- `VITE_GAM_SCAN_LIMIT_SIZES` (optional, comma-separated, example: `300x250,336x280,320x50`)

Ad account identity and verification:

- `public/ads.txt` must include your AdSense publisher line for production.
- Replace `pub-XXXXXXXXXXXXXXXX` in `public/ads.txt` with your real publisher id.

4. Start dev server:

```bash
npm run dev
```

5. Build production:

```bash
npm run build
```

## Supabase setup (MVP)

1. Create a Supabase project.
2. Enable Magic Link sign-in in Auth settings.
3. Add the callback URL:

- `http://localhost:5173/auth/callback`
- `https://url2stl.com/auth/callback`

4. Run migration:

- `supabase/migrations/20260505_mvp_schema.sql`

## Current MVP behavior

- If Supabase env vars are missing, app still works in placeholder mode using local storage for short URL records.
- STL export requires an authenticated user in-app.
- Redirect route resolves local records first, then tries Supabase lookup.

## Scope notes

Included:

- 3 predefined template presets
- Editable template text fields
- URL normalization and short code generation
- Real STL file download in browser

Not included yet:

- Custom short-link domain
- Production-safe public redirect service
- Advanced mesh repair/smoothing options
- Full analytics dashboard

## Production domain

- Primary site URL: `https://url2stl.com/`

## Deploy to GitHub Pages

Repository target:

- Owner: `mrdiamonddirt`
- Repo: `url-qr-stl`
- Preview URL: `https://mrdiamonddirt.github.io/url-qr-stl/`

This repo uses branch-based deployments with explicit commands:

- `dev` branch deploys the dev environment (`dev.url2stl.com`) and forces Google login on every route.
- `production` branch deploys production (`url2stl.com`).

Deploy commands:

```bash
npm run deploy:dev
npm run deploy:prod
```

Notes:

- Deploy commands push the current `HEAD` to the target branch (`origin/dev` or `origin/production`).
- Deploy commands require a clean working tree.
- `npm run deploy:dev` now runs a local build before pushing.
- `npm run deploy:dev` must be run from branch `dev`.
- `npm run deploy:prod` runs a local build before it pushes to production.
- `npm run deploy:prod` must be run from branch `production`.
- Production deploy requires a typed confirmation prompt.
- Because GitHub Pages serves one live site per repo, the most recent deploy becomes the active site.

One-time GitHub setup:

1. Open your GitHub repo settings.
2. Go to **Pages**.
3. Set **Source** to **GitHub Actions**.

Optional secrets (if you want live Supabase config on Pages):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional dev-specific secret overrides:

- `DEV_VITE_SUPABASE_URL`
- `DEV_VITE_SUPABASE_ANON_KEY`
- `DEV_VITE_GAM_SCAN_LIMIT_AD_UNIT_PATH`
- `DEV_VITE_GAM_SCAN_LIMIT_SIZES`

If those secrets are not set, the app still deploys and runs in placeholder/local mode.

## Google ad setup checklist

1. In Google AdSense, add and verify your site domain (`url2stl.com`).
2. In Google Ad Manager, create an ad unit for the blocked scan-limit placement.
3. Set `VITE_GAM_SCAN_LIMIT_AD_UNIT_PATH` to that ad unit path.
4. Set optional `VITE_GAM_SCAN_LIMIT_SIZES` if you want custom slot sizes.
5. Update `public/ads.txt` with your real `pub-...` id and deploy.

Notes:

- You generally do not need Google Cloud Console for this GAM/AdSense web setup.
- You do need the production URL in AdSense/GAM so Google can authorize serving on your domain.

## SEO phase 3 checklist (Google Search Console)

Property target:

- `https://url2stl.com/`

Verification setup:

1. In Google Search Console, open the `https://url2stl.com/` URL-prefix property.
2. Copy the HTML tag verification token.
3. Replace `replace-with-google-search-console-token` in `index.html`.
4. Optional Bing: replace `replace-with-bing-webmaster-token` in `index.html`.
5. Deploy and click Verify in Search Console.

Indexing and sitemap:

1. Submit sitemap URL: `https://url2stl.com/sitemap.xml`.
2. Request indexing for:
	- `https://url2stl.com/#/editor`
	- `https://url2stl.com/#/features`
	- `https://url2stl.com/#/faq`
	- `https://url2stl.com/#/guides`
3. Confirm coverage for these pages is `Indexed` after crawl.

Structured data validation:

1. Validate home and FAQ routes in Rich Results Test.
2. Confirm schema includes Organization, WebSite, SoftwareApplication, and FAQPage (on FAQ route).
3. Fix any parsing or required-field warnings before final reindex requests.

First 30-day monitoring loop:

1. Track query clusters weekly:
	- free qr maker
	- auto url conversion
	- qr to stl
	- url to obj converter
	- 3d model render print
2. Compare clicks, impressions, CTR, and average position every 7 days.
3. Refresh titles/H1 copy only if query intent mismatch appears (avoid keyword stuffing).
