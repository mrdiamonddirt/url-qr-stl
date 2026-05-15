import { describe, expect, test } from "vitest";
import { resolveMaskBoundsForTemplateExtents, resolveTemplateCropBounds } from "./modelGeometry";

describe("resolveMaskBoundsForTemplateExtents", () => {
  test("clamps full extents to stay inside edge guard", () => {
    const bounds = resolveMaskBoundsForTemplateExtents(
      { left: 0, top: 0, right: 1, bottom: 1 },
      160,
      160
    );

    expect(bounds).toEqual({
      left: 2,
      top: 2,
      right: 157,
      bottom: 157,
    });
  });

  test("maps normalized extents to sampled pixel bounds with padding", () => {
    const bounds = resolveMaskBoundsForTemplateExtents(
      { left: 0.25, top: 0.1, right: 0.75, bottom: 0.9 },
      200,
      100
    );

    expect(bounds).toEqual({
      left: 49,
      top: 9,
      right: 150,
      bottom: 90,
    });
  });

  test("returns null for empty extents", () => {
    const bounds = resolveMaskBoundsForTemplateExtents(
      { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
      200,
      100
    );

    expect(bounds).toBeNull();
  });
});

describe("resolveTemplateCropBounds", () => {
  test("prefers detected visible bounds over extents", () => {
    const bounds = resolveTemplateCropBounds(
      { left: 12, top: 8, right: 188, bottom: 190 },
      { left: 20, top: 16, right: 172, bottom: 176 }
    );

    expect(bounds).toEqual({
      left: 20,
      top: 16,
      right: 172,
      bottom: 176,
    });
  });

  test("falls back to extents when detected bounds are empty", () => {
    const bounds = resolveTemplateCropBounds(
      { left: 14, top: 10, right: 176, bottom: 180 },
      null
    );

    expect(bounds).toEqual({
      left: 14,
      top: 10,
      right: 176,
      bottom: 180,
    });
  });

  test("returns null when both sources are unavailable", () => {
    const bounds = resolveTemplateCropBounds(null, null);
    expect(bounds).toBeNull();
  });
});
