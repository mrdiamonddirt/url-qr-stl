import { describe, expect, test } from "vitest";
import {
  buildHashRouteFromPathname,
  buildHashRouteFromSpaRedirect,
  shouldPrioritizePathnameShortLink,
} from "./spaRedirect";

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

describe("shouldPrioritizePathnameShortLink", () => {
  test("forces short-link hash when stale editor hash is present", () => {
    expect(shouldPrioritizePathnameShortLink("/#/s/nViUhCA", "/editor")).toBe(true);
  });

  test("does not force when hash already matches short-link route", () => {
    expect(shouldPrioritizePathnameShortLink("/#/s/nViUhCA", "/s/nViUhCA")).toBe(false);
  });
});
