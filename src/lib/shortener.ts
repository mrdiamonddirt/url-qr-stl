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
  return `${window.location.origin}/s/${code}`;
}
