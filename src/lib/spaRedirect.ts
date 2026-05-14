function normalizeBasePath(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
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

  const basePath = normalizeBasePath(baseUrl);
  let routePath = parsed.pathname || "/";

  if (basePath && routePath.startsWith(`${basePath}/`)) {
    routePath = routePath.slice(basePath.length);
  } else if (basePath && routePath === basePath) {
    routePath = "/";
  }

  if (!routePath.startsWith("/")) {
    routePath = `/${routePath}`;
  }

  const route = `${routePath}${parsed.search || ""}`;
  return `${basePath}/#${route}`;
}
