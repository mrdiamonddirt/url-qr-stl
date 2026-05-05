import { StlExportRecord, ShortUrlRecord } from "../types";

const SHORT_URLS_KEY = "url-qr-stl.short-urls";
const STL_EXPORTS_KEY = "url-qr-stl.stl-exports";

function readJson<T>(key: string): T[] {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function saveShortUrl(record: ShortUrlRecord) {
  const current = readJson<ShortUrlRecord>(SHORT_URLS_KEY);
  writeJson(SHORT_URLS_KEY, [record, ...current]);
}

export function findShortUrlByCode(code: string): ShortUrlRecord | undefined {
  const current = readJson<ShortUrlRecord>(SHORT_URLS_KEY);
  return current.find((item) => item.code === code);
}

export function listShortUrlsByUser(userId?: string): ShortUrlRecord[] {
  const current = readJson<ShortUrlRecord>(SHORT_URLS_KEY);

  if (!userId) {
    return current;
  }

  return current.filter((item) => item.userId === userId);
}

export function saveStlExport(record: StlExportRecord) {
  const current = readJson<StlExportRecord>(STL_EXPORTS_KEY);
  writeJson(STL_EXPORTS_KEY, [record, ...current]);
}

/**
 * Rewrites every stored short URL so it uses the current origin + base path.
 * Fixes records created in dev (http://localhost:5173) so they work in production.
 */
export function backfillShortUrlOrigins() {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const correctPrefix = `${window.location.origin}${base}`;
  const current = readJson<ShortUrlRecord>(SHORT_URLS_KEY);
  const updated = current.map((record) => ({
    ...record,
    shortUrl: `${correctPrefix}/s/${record.code}`,
  }));
  writeJson(SHORT_URLS_KEY, updated);
}
