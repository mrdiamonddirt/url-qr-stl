function normalizeBasePath(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function buildHashRouteFromPathname(
  pathname: string,
  search: string,
  baseUrl: string,
): string | null {
  const basePath = normalizeBasePath(baseUrl);
  let routePath = (pathname || "/").trim() || "/";

  if (basePath && routePath.startsWith(`${basePath}/`)) {
    routePath = routePath.slice(basePath.length);
  } else if (basePath && routePath === basePath) {
    routePath = "/";
  } else if (basePath) {
    return null;
  }

  if (!routePath.startsWith("/")) {
    routePath = `/${routePath}`;
  }

  // Keep route matching consistent with exact hash routes (e.g. /auth/callback).
  // Static hosts may serve directory indexes as /path/ and preserve that trailing slash.
  if (routePath.length > 1 && routePath.endsWith("/")) {
    routePath = routePath.slice(0, -1);
  }

  const route = `${routePath}${search || ""}`;
  return `${basePath}/#${route}`;
}

export function buildHashRouteFromSpaRedirect(
  spaRedirect: string,
  baseUrl: string,
): string | null {
  const candidate = spaRedirect.trim();
  if (!candidate) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://url2stl.local");
  } catch {
    return null;
  }

  return buildHashRouteFromPathname(parsed.pathname || "/", parsed.search || "", baseUrl);
}

export function shouldPrioritizePathnameShortLink(
  pathnameHashTarget: string | null,
  currentHashPath: string,
): boolean {
  const targetHashPath = pathnameHashTarget
    ? (pathnameHashTarget.split("#")[1]?.split("?")[0] || "/")
    : "/";

  return Boolean(pathnameHashTarget && targetHashPath.startsWith("/s/") && currentHashPath !== targetHashPath);
}
