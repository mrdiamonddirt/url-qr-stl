import { customAlphabet } from "nanoid";

const makeCode = customAlphabet("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", 7);

export function generateShortCode() {
  return makeCode();
}

export function ensureHttpUrl(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Please enter a URL.");
  }

  const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(prefixed);

  return parsed.toString();
}

export function shortUrlForCode(code: string): string {
  // BASE_URL is root (`/`) for both development and production.
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${window.location.origin}${base}/s/${code}`;
}
