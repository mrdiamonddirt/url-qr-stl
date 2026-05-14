import { describe, expect, test } from "vitest";
import { buildHashRouteFromPathname, buildHashRouteFromSpaRedirect } from "./spaRedirect";

describe("buildHashRouteFromSpaRedirect", () => {
  test("maps root-host short links to hash routes", () => {
    expect(buildHashRouteFromSpaRedirect("/s/nViUhCA", "/")).toBe("/#/s/nViUhCA");
  });

  test("preserves query parameters", () => {
    expect(buildHashRouteFromSpaRedirect("/s/nViUhCA?utm=qr", "/")).toBe("/#/s/nViUhCA?utm=qr");
  });

  test("strips basename from path before building hash route", () => {
    expect(buildHashRouteFromSpaRedirect("/url-qr-stl/s/AbC1234", "/url-qr-stl/")).toBe(
      "/url-qr-stl/#/s/AbC1234",
    );
  });

  test("returns null for empty redirects", () => {
    expect(buildHashRouteFromSpaRedirect("   ", "/")).toBeNull();
  });
});

describe("buildHashRouteFromPathname", () => {
  test("maps direct pathname deep links for root deploys", () => {
    expect(buildHashRouteFromPathname("/s/nViUhCA", "", "/")).toBe("/#/s/nViUhCA");
  });

  test("returns null when pathname does not belong to configured basename", () => {
    expect(buildHashRouteFromPathname("/s/nViUhCA", "", "/url-qr-stl/")).toBeNull();
  });
});
