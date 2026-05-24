import { describe, expect, test } from "vitest";
import { TEMPLATE_PRESETS } from "../constants/templates";
import { isRemoteImageUrl, resolveLoopConfig, resolveTemplateCompositionExtents } from "./templatePreview";
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

describe("resolveTemplateCompositionExtents", () => {
  function buildTemplateValues(templateId: string, overrides?: Record<string, string>): Record<string, string> {
    const template = TEMPLATE_PRESETS.find((preset) => preset.id === templateId);
    if (!template) {
      return overrides ?? {};
    }

    const defaults = template.fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = field.defaultValue;
      return acc;
    }, {});

    defaults.template_color = template.accentColor;
    if (template.ctaConfig) {
      defaults[template.ctaConfig.fieldKey] = template.ctaLabel ?? defaults[template.ctaConfig.fieldKey] ?? "";
      defaults[template.ctaConfig.sizeKey] = String(template.ctaConfig.defaultSizePx);
      defaults[template.ctaConfig.fontKey] = "default";
      defaults[template.ctaConfig.chipHeightKey] = String(template.ctaConfig.chipHeight);
    }

    return {
      ...defaults,
      ...(overrides ?? {}),
    };
  }

  test("keeps fused-label template extents within canvas and full-frame width", () => {
    const template = TEMPLATE_PRESETS.find((preset) => preset.id === "scan-me");
    expect(template).toBeTruthy();

    const extents = resolveTemplateCompositionExtents(template as NonNullable<typeof template>, buildTemplateValues("scan-me"));
    expect(extents.left).toBeGreaterThanOrEqual(0);
    expect(extents.right).toBeLessThanOrEqual(1);
    expect(extents.bottom).toBeLessThanOrEqual(1);
    expect(extents.right - extents.left).toBeGreaterThan(0.75);
  });

  test("extends bottom bounds when CTA is outside frame", () => {
    const base = TEMPLATE_PRESETS.find((preset) => preset.id === "scan-me");
    expect(base).toBeTruthy();
    const template = {
      ...(base as NonNullable<typeof base>),
      bottomBorderMode: "none" as const,
    };

    const extents = resolveTemplateCompositionExtents(template, buildTemplateValues("scan-me", { cta_chip_height: "58" }));
    expect(extents.bottom).toBeGreaterThan(0.94);
  });

  test("captures top loop geometry above frame", () => {
    const template = TEMPLATE_PRESETS.find((preset) => preset.id === "loop-square");
    expect(template).toBeTruthy();

    const extents = resolveTemplateCompositionExtents(
      template as NonNullable<typeof template>,
      buildTemplateValues("loop-square", {
        loop_outer_radius: "18",
        loop_stem_width: "48",
        loop_thickness: "10",
      })
    );

    expect(extents.top).toBeLessThan(0.08);
  });

  test("keeps rounded border template extents bounded to canvas", () => {
    const template = TEMPLATE_PRESETS.find((preset) => preset.id === "simple-border-round");
    expect(template).toBeTruthy();

    const extents = resolveTemplateCompositionExtents(
      template as NonNullable<typeof template>,
      buildTemplateValues("simple-border-round")
    );

    expect(extents.left).toBeGreaterThanOrEqual(0);
    expect(extents.top).toBeGreaterThanOrEqual(0);
    expect(extents.right).toBeLessThanOrEqual(1);
    expect(extents.bottom).toBeLessThanOrEqual(1);
  });

  test("captures combined loop and CTA extents for hybrid templates", () => {
    const template = TEMPLATE_PRESETS.find((preset) => preset.id === "loop-circle-text");
    expect(template).toBeTruthy();

    const extents = resolveTemplateCompositionExtents(
      template as NonNullable<typeof template>,
      buildTemplateValues("loop-circle-text", {
        loop_outer_radius: "20",
        loop_stem_width: "50",
        loop_thickness: "11",
        cta_chip_height: "44",
      })
    );

    expect(extents.top).toBeLessThan(0.08);
    expect(extents.bottom).toBeGreaterThan(0.9);
    expect(extents.left).toBeGreaterThanOrEqual(0);
    expect(extents.right).toBeLessThanOrEqual(1);
  });

  test("returns equal width and height extents for pure circle frames", () => {
    const base = TEMPLATE_PRESETS.find((preset) => preset.id === "simple-border");
    expect(base).toBeTruthy();

    const circleTemplate = {
      ...(base as NonNullable<typeof base>),
      id: "test-circle",
      name: "Test Circle",
      frameStyle: "circle" as const,
      loopConfig: undefined,
      ctaConfig: undefined,
      ctaLabel: undefined,
      fields: [],
      bottomBorderMode: "normal" as const,
    };

    const extents = resolveTemplateCompositionExtents(circleTemplate, buildTemplateValues("simple-border"));
    const width = extents.right - extents.left;
    const height = extents.bottom - extents.top;
    expect(Math.abs(width - height)).toBeLessThan(0.0001);
  });

  test("keeps CTA bounds inside circle frame box for circle CTA templates", () => {
    const scanMe = TEMPLATE_PRESETS.find((preset) => preset.id === "scan-me");
    expect(scanMe).toBeTruthy();

    const circleCtaTemplate = {
      ...(scanMe as NonNullable<typeof scanMe>),
      id: "scan-me-circle",
      name: "Scan Me Circle",
      frameStyle: "circle" as const,
      borderStyle: "simple" as const,
      bottomBorderMode: "normal" as const,
    };

    const values = buildTemplateValues("scan-me", {
      cta_text: "SCAN THIS TAG",
      cta_size: "30",
      cta_chip_height: "46",
    });

    const circleExtents = resolveTemplateCompositionExtents(circleCtaTemplate, values);
    const circleNoCtaExtents = resolveTemplateCompositionExtents(
      {
        ...circleCtaTemplate,
        ctaConfig: undefined,
        ctaLabel: undefined,
        fields: [],
      },
      values
    );

    expect(circleExtents.left).toBeGreaterThanOrEqual(circleNoCtaExtents.left - 0.001);
    expect(circleExtents.right).toBeLessThanOrEqual(circleNoCtaExtents.right + 0.001);
    expect(circleExtents.bottom).toBeLessThanOrEqual(circleNoCtaExtents.bottom + 0.001);
  });
});
