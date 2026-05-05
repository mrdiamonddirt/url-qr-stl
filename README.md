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
