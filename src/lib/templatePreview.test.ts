import { describe, expect, test } from "vitest";
import { isRemoteImageUrl, resolveLoopConfig } from "./templatePreview";
import { TemplateLoopConfig } from "../types";

describe("templatePreview logo URL handling", () => {
  test("treats http(s) URLs as remote images", () => {
    expect(isRemoteImageUrl("https://example.com/logo.png")).toBe(true);
    expect(isRemoteImageUrl("http://localhost:54321/storage/v1/object/public/user-logos/x.png")).toBe(true);
  });

  test("does not treat data/blob/relative URLs as remote", () => {
    expect(isRemoteImageUrl("data:image/png;base64,abc")).toBe(false);
    expect(isRemoteImageUrl("blob:http://localhost:5173/abc-def")).toBe(false);
    expect(isRemoteImageUrl("/assets/logo.png")).toBe(false);
    expect(isRemoteImageUrl("assets/logo.png")).toBe(false);
  });
});

describe("resolveLoopConfig", () => {
  const defaultLoop: TemplateLoopConfig = {
    outerRadius: 18,
    innerRadius: 8,
    stemWidth: 48,
    stemHeight: 14,
    lift: 8,
  };

  test("expands loop radius when loop width increases", () => {
    const resolved = resolveLoopConfig(defaultLoop, {
      loop_stem_width: "80",
      loop_outer_radius: "18",
      loop_thickness: "10",
    });

    expect(resolved.stemWidth).toBe(80);
    expect(resolved.outerRadius).toBeGreaterThan(18);
    expect(resolved.innerRadius).toBe(resolved.outerRadius - 10);
  });

  test("respects explicit loop height controls and clamps extremes", () => {
    const resolved = resolveLoopConfig(defaultLoop, {
      loop_stem_width: "12",
      loop_outer_radius: "60",
      loop_thickness: "1",
    });

    expect(resolved.stemWidth).toBe(16);
    expect(resolved.outerRadius).toBe(40);
    expect(resolved.innerRadius).toBeGreaterThanOrEqual(2);
  });
});
