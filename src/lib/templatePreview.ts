import { QrTemplate, TemplateLoopConfig } from "../types";

type ComposeTemplatePreviewInput = {
  template: QrTemplate;
  values: Record<string, string>;
  qrDataUrl: string;
  shortUrl: string;
  renderIntent?: "display" | "model";
};

type ResolvedCtaLayout = {
  lines: string[];
  lineHeight: number;
  chipHeight: number;
  chipWidth: number;
  chipRadius: number;
  bottomInset: number;
  textSize: number;
  blockStyle: boolean;
  fontStack: string;
};

type CompositionLayout = {
  scale: number;
  frameX: number;
  frameY: number;
  frameSize: number;
  frameContentInset: number;
  qrX: number;
  qrY: number;
  qrSize: number;
  chipY: number | null;
  ctaLayout: ResolvedCtaLayout | null;
};

export type TemplateCompositionExtents = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const BASE_CANVAS_SIZE = 480;
const SELECTOR_PREVIEW_SIZE = 232;
const CTA_SIZE_SCALE = 1;
export const CTA_FONT_STACKS: Record<string, string> = {
  default: "'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  impact: "Impact, 'Arial Black', sans-serif",
  mono: "'Courier New', 'Lucida Console', monospace",
  serif: "Georgia, 'Times New Roman', serif",
  condensed: "'Trebuchet MS', 'Segoe UI', sans-serif",
};
const CTA_FONT_STACK = CTA_FONT_STACKS.default;

function resolveScaledCtaSize(rawValue: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(rawValue)) {
    return clampNumber(fallback, min, max);
  }

  // Support both legacy plain-px values (e.g. 21) and scaled values (e.g. 210).
  if (rawValue >= min * CTA_SIZE_SCALE && rawValue <= max * CTA_SIZE_SCALE) {
    return clampNumber(rawValue / CTA_SIZE_SCALE, min, max);
  }

  return clampNumber(rawValue, min, max);
}

function drawTrackedCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  trackingPx: number
) {
  if (!text) {
    return;
  }

  if (trackingPx <= 0 || text.length <= 1) {
    ctx.strokeText(text, centerX, y);
    ctx.fillText(text, centerX, y);
    return;
  }

  const glyphs = Array.from(text);
  const glyphWidths = glyphs.map((glyph) => ctx.measureText(glyph).width);
  const totalWidth = glyphWidths.reduce((sum, width) => sum + width, 0) + trackingPx * (glyphs.length - 1);
  let drawX = centerX - totalWidth / 2;

  glyphs.forEach((glyph, index) => {
    const width = glyphWidths[index] ?? 0;
    const glyphCenterX = drawX + width / 2;
    ctx.strokeText(glyph, glyphCenterX, y);
    ctx.fillText(glyph, glyphCenterX, y);
    drawX += width + trackingPx;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const limitedRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + limitedRadius, y);
  ctx.lineTo(x + width - limitedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + limitedRadius);
  ctx.lineTo(x + width, y + height - limitedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - limitedRadius, y + height);
  ctx.lineTo(x + limitedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - limitedRadius);
  ctx.lineTo(x, y + limitedRadius);
  ctx.quadraticCurveTo(x, y, x + limitedRadius, y);
  ctx.closePath();
}

function loadImage(src: string, crossOrigin: "anonymous" | null = null): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) {
      image.crossOrigin = crossOrigin;
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load QR preview image."));
    image.src = src;
  });
}

export function isRemoteImageUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampNormalized(value: number): number {
  return clampNumber(value, 0, 1);
}

function resolveTemplateAccentColor(template: QrTemplate, values?: Record<string, string>): string {
  const raw = values?.template_color?.trim();
  if (!raw) {
    return template.accentColor;
  }

  const normalized = raw.toLowerCase();
  const isHex = /^#[0-9a-f]{6}$/i.test(normalized) || /^#[0-9a-f]{3}$/i.test(normalized);
  return isHex ? normalized : template.accentColor;
}

function beginFramePath(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  x: number,
  y: number,
  width: number,
  height: number,
  inset = 0,
  scale = 1
) {
  const drawX = x + inset;
  const drawY = y + inset;
  const drawWidth = Math.max(0, width - inset * 2);
  const drawHeight = Math.max(0, height - inset * 2);

  if (template.frameStyle === "rounded") {
    drawRoundedRect(ctx, drawX, drawY, drawWidth, drawHeight, 24 * scale);
    return;
  }

  if (template.frameStyle === "circle") {
    drawRoundedRect(ctx, drawX, drawY, drawWidth, drawHeight, 100 * scale);
    return;
  }

  ctx.beginPath();
  ctx.rect(drawX, drawY, drawWidth, drawHeight);
  ctx.closePath();
}

export function resolveLoopConfig(
  loop: TemplateLoopConfig,
  values: Record<string, string>
): { outerRadius: number; innerRadius: number; stemWidth: number; stemHeight: number; lift: number } {
  const rawOuter = Number(values.loop_outer_radius);
  const outerRadius = Number.isFinite(rawOuter) && rawOuter > 0
    ? Math.min(40, Math.max(8, rawOuter))
    : loop.outerRadius;

  const rawStemWidth = Number(values.loop_stem_width);
  const stemWidth = Number.isFinite(rawStemWidth) && rawStemWidth > 0
    ? Math.min(80, Math.max(16, rawStemWidth))
    : loop.stemWidth;

  const rawWidthDelta = stemWidth - loop.stemWidth;
  const widthDrivenRadius = loop.outerRadius + rawWidthDelta * 0.4;
  const resolvedOuterRadius = Number.isFinite(rawWidthDelta)
    ? Math.min(40, Math.max(8, Math.max(outerRadius, widthDrivenRadius)))
    : outerRadius;

  const defaultThickness = loop.outerRadius - loop.innerRadius;
  const rawThickness = Number(values.loop_thickness);
  const thickness = Number.isFinite(rawThickness) && rawThickness > 0
    ? Math.min(20, Math.max(3, rawThickness))
    : defaultThickness;

  const innerRadius = Math.max(2, resolvedOuterRadius - thickness);
  return { outerRadius: resolvedOuterRadius, innerRadius, stemWidth, stemHeight: loop.stemHeight, lift: loop.lift };
}

function getFrameStrokeWidth(template: QrTemplate, scale = 1, values?: Record<string, string>): number {
  if (template.borderStyle === "none") {
    return 0;
  }

  const rawOverride = values ? Number(values.border_thickness) : NaN;
  const baseWidth = Number.isFinite(rawOverride) && rawOverride > 0
    ? Math.min(24, Math.max(1, rawOverride))
    : (template.borderStyle === "fancy" ? 8 : 6);
  return baseWidth * scale;
}

function strokeFrame(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1,
  values?: Record<string, string>,
  bottomSplitY?: number
) {
  if (template.borderStyle === "none") {
    return;
  }

  const borderWidth = getFrameStrokeWidth(template, scale, values);
  if (borderWidth <= 0) {
    return;
  }

  if (template.frameStyle === "sharp") {
    const left = Math.round(x);
    const top = Math.round(y);
    const right = Math.round(x + width);
    const bottom = Math.round(y + height);
    const outerWidth = Math.max(0, right - left);
    const outerHeight = Math.max(0, bottom - top);
    const snappedBorder = Math.max(1, Math.round(borderWidth));
    const edge = Math.min(snappedBorder, Math.floor(Math.min(outerWidth, outerHeight) / 2));

    if (edge <= 0 || outerWidth <= 0 || outerHeight <= 0) {
      return;
    }

    ctx.fillStyle = resolveTemplateAccentColor(template, values);
    if (template.bottomBorderMode === "fusedLabel") {
      return;
    }

    const drawBottomEdge = template.bottomBorderMode !== "none";
    ctx.fillRect(left, top, outerWidth, edge);
    if (drawBottomEdge) {
      ctx.fillRect(left, bottom - edge, outerWidth, edge);
    }
    const sideHeight = Math.max(0, outerHeight - (drawBottomEdge ? edge * 2 : edge));
    if (sideHeight > 0) {
      ctx.fillRect(left, top + edge, edge, sideHeight);
      ctx.fillRect(right - edge, top + edge, edge, sideHeight);
    }
    return;
  }

  // Support bottomBorderMode: normal (default), none (no bottom border), fusedLabel (bottom border fuses with label area)
  const innerInset = Math.min(borderWidth, Math.min(width, height) / 2);
  ctx.fillStyle = resolveTemplateAccentColor(template, values);

  // Draw full border by default.
  if (!template.bottomBorderMode || template.bottomBorderMode === "normal") {
    beginFramePath(ctx, template, x, y, width, height, 0, scale);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    beginFramePath(ctx, template, x, y, width, height, innerInset, scale);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Draw border with omitted bottom edge
  if (template.bottomBorderMode === "none") {
    // Draw border except bottom edge
    ctx.beginPath();
    ctx.moveTo(x, y + borderWidth / 2);
    ctx.lineTo(x + width, y + borderWidth / 2);
    ctx.lineTo(x + width, y + height - borderWidth / 2);
    ctx.lineTo(x, y + height - borderWidth / 2);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(x + innerInset, y + innerInset);
    ctx.lineTo(x + width - innerInset, y + innerInset);
    ctx.lineTo(x + width - innerInset, y + height - innerInset);
    ctx.lineTo(x + innerInset, y + height - innerInset);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Overdraw bottom edge with white to erase border
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y + height - borderWidth, width, borderWidth + 2);
    ctx.restore();
    return;
  }

}

function drawFusedQrBorder(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  values: Record<string, string>,
  layout: CompositionLayout
) {
  if (template.bottomBorderMode !== "fusedLabel" || layout.qrSize <= 0) {
    return;
  }

  const thickness = Math.max(1, Math.round(getFrameStrokeWidth(template, layout.scale, values)));
  const x = Math.round(layout.qrX - thickness);
  const y = Math.round(layout.qrY - thickness);
  const size = Math.max(0, Math.round(layout.qrSize + thickness * 2));

  if (size <= 0) {
    return;
  }

  ctx.fillStyle = resolveTemplateAccentColor(template, values);
  ctx.fillRect(x, y, size, thickness);
  ctx.fillRect(x, y + size - thickness, size, thickness);
  const sideHeight = Math.max(0, size - thickness * 2);
  if (sideHeight > 0) {
    ctx.fillRect(x, y + thickness, thickness, sideHeight);
    ctx.fillRect(x + size - thickness, y + thickness, thickness, sideHeight);
  }
}

function drawTopLoop(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  frameX: number,
  frameY: number,
  frameSize: number,
  scale = 1,
  values?: Record<string, string>
) {
  const loopTemplate = template.loopConfig;
  if (!loopTemplate) {
    return;
  }

  const loop = values ? resolveLoopConfig(loopTemplate, values) : loopTemplate;

  const centerX = frameX + frameSize / 2;
  const stemHeight = loop.stemHeight * scale;
  const stemWidth = loop.stemWidth * scale;
  const outerRadius = loop.outerRadius * scale;
  const innerRadius = loop.innerRadius * scale;
  const lift = loop.lift * scale;
  const stemTop = frameY - stemHeight;
  const loopCenterY = stemTop - lift;
  const stemBottomY = frameY;
  const stemTopY = stemTop;
  const shoulderY = stemTopY + Math.max(2 * scale, stemHeight * 0.26);
  const halfBottom = stemWidth / 2;
  const halfTop = Math.max(outerRadius * 0.46, Math.min(halfBottom, outerRadius * 0.62));
  const shoulderControlY = shoulderY - Math.max(1.5 * scale, stemHeight * 0.14);

  ctx.fillStyle = resolveTemplateAccentColor(template, values);
  ctx.beginPath();
  ctx.moveTo(centerX - halfBottom, stemBottomY);
  ctx.lineTo(centerX - halfBottom, shoulderY);
  ctx.quadraticCurveTo(centerX - halfBottom, shoulderControlY, centerX - halfTop, stemTopY);
  ctx.lineTo(centerX + halfTop, stemTopY);
  ctx.quadraticCurveTo(centerX + halfBottom, shoulderControlY, centerX + halfBottom, shoulderY);
  ctx.lineTo(centerX + halfBottom, stemBottomY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, loopCenterY, outerRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(centerX, loopCenterY, innerRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (!currentLine) {
      let partial = "";
      for (const char of word) {
        const candidateChar = partial + char;
        if (ctx.measureText(candidateChar).width > maxWidth) {
          break;
        }
        partial = candidateChar;
      }
      currentLine = partial || word[0];
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  const consumedWords = lines.join(" ").split(" ").length;
  if (consumedWords < words.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    let withEllipsis = `${lines[lastIndex]}...`;
    while (withEllipsis.length > 3 && ctx.measureText(withEllipsis).width > maxWidth) {
      withEllipsis = `${withEllipsis.slice(0, -4)}...`;
    }
    lines[lastIndex] = withEllipsis;
  }

  return lines.slice(0, maxLines);
}

function resolveCtaLayout(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  values: Record<string, string>,
  scale = 1,
  frameInnerWidth?: number
): ResolvedCtaLayout | null {
  const config = template.ctaConfig;
  if (!config) {
    if (!template.ctaLabel) {
      return null;
    }

    const label = template.ctaLabel.replace(/\s+/g, " ").trim();
    if (!label) {
      return null;
    }

    const textSize = 21 * scale;
    const fontStack = CTA_FONT_STACKS.default;
    ctx.font = `800 ${textSize}px ${fontStack}`;
    const lines = wrapTextLines(ctx, label, 220 * scale, 2);
    const lineHeight = Math.max(11 * scale, textSize * 1.04);
    const chipHeight = Math.max(42 * scale, lines.length * lineHeight + 10 * scale);
    const chipWidth = frameInnerWidth ?? clampNumber(
      lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0) + 32 * scale,
      126 * scale,
      252 * scale
    );
    const topRadius = Math.max(10 * scale, Math.floor(chipHeight * 0.28));

    return {
      lines,
      lineHeight,
      chipHeight,
      chipWidth,
      chipRadius: topRadius,
      bottomInset: frameInnerWidth !== undefined ? 0 : 30 * scale,
      textSize,
      blockStyle: frameInnerWidth !== undefined,
      fontStack,
    };
  }

  const fallbackText = template.ctaLabel ?? "";
  const rawLabel = values[config.fieldKey] ?? fallbackText;
  const label = rawLabel.replace(/\s+/g, " ").trim() || fallbackText;
  if (!label) {
    return null;
  }

  const rawSize = Number(values[config.sizeKey]);
  const size = resolveScaledCtaSize(rawSize, config.minSizePx, config.maxSizePx, config.defaultSizePx) * scale;

  const fontKey = values[config.fontKey] ?? "default";
  const fontStack = CTA_FONT_STACKS[fontKey] ?? CTA_FONT_STACK;

  ctx.fillStyle = "#ffffff";
  const weight = fontKey === "impact" ? 700 : 800;
  ctx.font = `${weight} ${size}px ${fontStack}`;
  const lines = wrapTextLines(ctx, label, (frameInnerWidth ?? config.maxWidth * scale), config.maxLines);
  const lineHeight = Math.max(14 * scale, Math.round(size * 1.1));
  const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
  const rawChipHeight = Number(values[config.chipHeightKey]);
  const userChipHeight = Number.isFinite(rawChipHeight) && rawChipHeight > 0 ? rawChipHeight : config.chipHeight;
  const chipHeight = Math.max(userChipHeight * scale, contentHeight + 10 * scale);
  const chipWidth = frameInnerWidth ?? clampNumber(
    lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0) + config.chipPaddingX * scale * 2,
    126 * scale,
    (config.maxWidth + config.chipPaddingX * 2) * scale
  );
  const topRadius = Math.max(config.chipRadius * scale, Math.floor(chipHeight * 0.28));

  return {
    lines,
    lineHeight,
    chipHeight,
    chipWidth,
    chipRadius: topRadius,
    bottomInset: frameInnerWidth !== undefined ? 0 : config.chipBottomInset * scale,
    textSize: size,
    blockStyle: frameInnerWidth !== undefined,
    fontStack,
  };
}

function drawEditableCtaLabel(
  ctx: CanvasRenderingContext2D,
  layout: ResolvedCtaLayout,
  canvasSize: number,
  chipYOverride?: number,
  renderIntent: "display" | "model" = "display"
) {
  const chipY = chipYOverride ?? canvasSize - layout.bottomInset - layout.chipHeight;
  const chipX = (canvasSize - layout.chipWidth) / 2;
  let drawChipX = chipX;
  let drawChipY = chipY;
  let drawChipWidth = layout.chipWidth;
  let drawChipHeight = layout.chipHeight;

  ctx.fillStyle = "#101418";
  if (layout.blockStyle) {
    // Snap to integer pixels to keep frame/CTA edges crisp without intruding into the QR area.
    drawChipX = Math.round(chipX);
    drawChipY = Math.round(chipY);
    drawChipWidth = Math.round(layout.chipWidth);
    drawChipHeight = Math.round(layout.chipHeight);
    ctx.fillRect(drawChipX, drawChipY, drawChipWidth, drawChipHeight);
  } else {
    drawRoundedRect(ctx, chipX, chipY, layout.chipWidth, layout.chipHeight, layout.chipRadius);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${layout.textSize}px ${layout.fontStack}`;
  if (renderIntent === "display") {
    ctx.strokeStyle = "rgba(8, 10, 12, 0.55)";
    ctx.lineWidth = Math.max(1, layout.textSize * 0.08);
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = Math.max(1, layout.textSize * 0.12);
    ctx.shadowOffsetY = Math.max(0.5, layout.textSize * 0.035);
  } else {
    ctx.strokeStyle = "transparent";
    ctx.lineWidth = 0;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tracking = Math.max(0.1, layout.textSize * 0.035);
  const textTop = drawChipY + drawChipHeight / 2 - ((layout.lines.length - 1) * layout.lineHeight) / 2;
  layout.lines.forEach((line, index) => {
    drawTrackedCenteredText(
      ctx,
      line,
      drawChipX + drawChipWidth / 2,
      textTop + index * layout.lineHeight,
      tracking
    );
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 1;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function buildDefaultTemplateValues(template: QrTemplate): Record<string, string> {
  const values = template.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.defaultValue;
    return acc;
  }, {});

  values.template_color = template.accentColor;

  if (template.ctaConfig) {
    values[template.ctaConfig.fieldKey] = values[template.ctaConfig.fieldKey] ?? template.ctaLabel ?? "";
    values[template.ctaConfig.sizeKey] = String(template.ctaConfig.defaultSizePx * CTA_SIZE_SCALE);
    values[template.ctaConfig.fontKey] = "default";
    values[template.ctaConfig.chipHeightKey] = String(template.ctaConfig.chipHeight);
  }

  return values;
}

function resolveQrInset(
  frameSize: number,
  scale: number,
  frameStrokeWidth: number
): number {
  const borderDrivenInset = frameStrokeWidth > 0 ? frameStrokeWidth * 0.55 : frameSize * 0.045;
  return clampNumber(borderDrivenInset, 8 * scale, 18 * scale);
}

function resolveCompositionLayout(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  values: Record<string, string>,
  canvasSize: number
): CompositionLayout {
  const scale = canvasSize / BASE_CANVAS_SIZE;
  // Uniform border/spacing unless overridden by bottomBorderMode
  const frameInset = (template.borderStyle === "none" ? 32 : 22) * scale;
  const loopExtraTop = template.loopConfig
    ? (() => {
      const resolved = resolveLoopConfig(template.loopConfig, values);
      return (resolved.outerRadius + resolved.stemHeight + resolved.lift + 10) * scale;
    })()
    : 0;
  const frameTop = frameInset + loopExtraTop;
  const frameBottom = canvasSize - frameInset;
  const frameSize = Math.min(canvasSize - frameInset * 2, frameBottom - frameTop);
  const frameX = (canvasSize - frameSize) / 2;
  const frameY = frameTop;
  const frameStrokeWidth = getFrameStrokeWidth(template, scale, values);
  const frameContentInset = frameStrokeWidth > 0 ? frameStrokeWidth : 0;
  const frameInnerWidth = Math.max(0, frameSize - 2 * frameContentInset);
  let ctaLayout = resolveCtaLayout(ctx, template, values, scale, template.ctaConfig ? frameInnerWidth : undefined);
  const blockCta = ctaLayout?.blockStyle ?? false;
  const qrInset = resolveQrInset(frameSize, scale, frameStrokeWidth);
  const ctaGap = blockCta ? 0 : Math.max(6 * scale, frameSize * 0.02);
  const contentLeft = frameX + frameContentInset;
  const contentTop = frameY + frameContentInset;
  const contentRight = frameX + frameSize - frameContentInset;
  const contentBottom = frameY + frameSize - frameContentInset;

  const qrLeft = contentLeft + qrInset;
  const qrTop = contentTop + qrInset;
  const qrRight = contentRight - qrInset;
  const qrAvailableWidth = Math.max(0, qrRight - qrLeft);

  let chipYRaw = null;
  const borderWidthPx = Math.max(1, Math.round(frameStrokeWidth));
  if (ctaLayout) {
    if (template.bottomBorderMode === "none") {
      // Label sits outside border area
      chipYRaw = frameY + frameSize + ctaLayout.bottomInset;
    } else if (template.bottomBorderMode === "fusedLabel") {
      // Keep CTA anchored at the bottom inside the frame border.
      chipYRaw = contentBottom - ctaLayout.chipHeight;
    } else {
      // Normal: label inside border
      chipYRaw = contentBottom - ctaLayout.bottomInset - ctaLayout.chipHeight;
    }
  }

  const qrBottomAnchor = chipYRaw === null
    ? contentBottom - qrInset
    : (template.bottomBorderMode === "fusedLabel"
      ? chipYRaw - borderWidthPx
      : chipYRaw - ctaGap - qrInset);
  let qrBottomLimit = Math.max(qrTop, qrBottomAnchor);
  let qrAvailableHeight = Math.max(0, qrBottomLimit - qrTop);
  let qrSize = Math.max(0, Math.floor(Math.min(qrAvailableWidth, qrAvailableHeight)));

  if (ctaLayout && template.bottomBorderMode === "fusedLabel") {
    const borderWidth = Math.max(1, Math.round(frameStrokeWidth));
    const fusedChipWidth = Math.max(0, Math.round(qrSize + borderWidth * 2));
    ctaLayout = {
      ...ctaLayout,
      chipWidth: fusedChipWidth,
    };
  }

  const qrX = Math.round(qrLeft + (qrAvailableWidth - qrSize) / 2);
  const qrY = Math.round(qrTop + (Math.max(0, qrAvailableHeight - qrSize)) / 2);
  const chipY = chipYRaw === null ? null : Math.round(chipYRaw);
  return {
    scale,
    frameX,
    frameY,
    frameSize,
    frameContentInset,
    qrX,
    qrY,
    qrSize,
    chipY,
    ctaLayout,
  };
}

export function resolveTemplateCompositionExtents(
  template: QrTemplate,
  values: Record<string, string>,
  canvasSize = BASE_CANVAS_SIZE
): TemplateCompositionExtents {
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    };
  }

  const layout = resolveCompositionLayout(ctx, template, values, canvasSize);
  let left = layout.frameX;
  let top = layout.frameY;
  let right = layout.frameX + layout.frameSize;
  let bottom = layout.frameY + layout.frameSize;

  if (template.loopConfig) {
    const loop = resolveLoopConfig(template.loopConfig, values);
    const centerX = layout.frameX + layout.frameSize / 2;
    const stemHeight = loop.stemHeight * layout.scale;
    const outerRadius = loop.outerRadius * layout.scale;
    const lift = loop.lift * layout.scale;
    const stemTop = layout.frameY - stemHeight;
    const loopCenterY = stemTop - lift;

    left = Math.min(left, centerX - outerRadius);
    right = Math.max(right, centerX + outerRadius);
    top = Math.min(top, loopCenterY - outerRadius);
  }

  if (layout.ctaLayout && layout.chipY !== null) {
    const chipX = (canvasSize - layout.ctaLayout.chipWidth) / 2;
    left = Math.min(left, chipX);
    right = Math.max(right, chipX + layout.ctaLayout.chipWidth);
    top = Math.min(top, layout.chipY);
    bottom = Math.max(bottom, layout.chipY + layout.ctaLayout.chipHeight);
  }

  if (right <= left || bottom <= top) {
    return {
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    };
  }

  return {
    left: clampNormalized(left / canvasSize),
    top: clampNormalized(top / canvasSize),
    right: clampNormalized(right / canvasSize),
    bottom: clampNormalized(bottom / canvasSize),
  };
}

function drawDemoQrPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  const modules = 21;
  const moduleSize = Math.max(1, Math.floor(size / modules));
  const qrSize = moduleSize * modules;
  const offsetX = x + (size - qrSize) / 2;
  const offsetY = y + (size - qrSize) / 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(offsetX, offsetY, qrSize, qrSize);

  const isFinder = (mx: number, my: number) => {
    const inTopLeft = mx < 7 && my < 7;
    const inTopRight = mx > modules - 8 && my < 7;
    const inBottomLeft = mx < 7 && my > modules - 8;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  const drawFinder = (startX: number, startY: number) => {
    ctx.fillStyle = "#111111";
    ctx.fillRect(offsetX + startX * moduleSize, offsetY + startY * moduleSize, moduleSize * 7, moduleSize * 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(
      offsetX + (startX + 1) * moduleSize,
      offsetY + (startY + 1) * moduleSize,
      moduleSize * 5,
      moduleSize * 5
    );
    ctx.fillStyle = "#111111";
    ctx.fillRect(
      offsetX + (startX + 2) * moduleSize,
      offsetY + (startY + 2) * moduleSize,
      moduleSize * 3,
      moduleSize * 3
    );
  };

  drawFinder(0, 0);
  drawFinder(modules - 7, 0);
  drawFinder(0, modules - 7);

  ctx.fillStyle = "#111111";
  for (let my = 0; my < modules; my += 1) {
    for (let mx = 0; mx < modules; mx += 1) {
      if (isFinder(mx, my)) {
        continue;
      }

      const seed = (mx * 17 + my * 31 + (mx ^ my) * 7) % 11;
      if (seed < 4 || (mx + my) % 9 === 0) {
        ctx.fillRect(offsetX + mx * moduleSize, offsetY + my * moduleSize, moduleSize, moduleSize);
      }
    }
  }
}

export async function composeTemplateSelectorPreview(
  template: QrTemplate,
  values?: Record<string, string>,
  qrDataUrl?: string
): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SELECTOR_PREVIEW_SIZE;
    canvas.height = SELECTOR_PREVIEW_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }

    const resolvedValues = { ...buildDefaultTemplateValues(template), ...(values ?? {}) };
    const layout = resolveCompositionLayout(ctx, template, resolvedValues, SELECTOR_PREVIEW_SIZE);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(layout.frameX, layout.frameY, layout.frameSize, layout.frameSize);
    strokeFrame(
      ctx,
      template,
      layout.frameX,
      layout.frameY,
      layout.frameSize,
      layout.frameSize,
      layout.scale,
      resolvedValues,
      layout.chipY ?? undefined
    );
    drawTopLoop(ctx, template, layout.frameX, layout.frameY, layout.frameSize, layout.scale, resolvedValues);

    ctx.save();
    beginFramePath(
      ctx,
      template,
      layout.frameX,
      layout.frameY,
      layout.frameSize,
      layout.frameSize,
      layout.frameContentInset,
      layout.scale
    );
    ctx.clip();

    if (layout.qrSize > 0) {
      if (qrDataUrl) {
        try {
          const qrImage = await loadImage(qrDataUrl);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(qrImage, layout.qrX, layout.qrY, layout.qrSize, layout.qrSize);
          ctx.imageSmoothingEnabled = true;
        } catch {
          drawDemoQrPattern(ctx, layout.qrX, layout.qrY, layout.qrSize);
        }
      } else {
        drawDemoQrPattern(ctx, layout.qrX, layout.qrY, layout.qrSize);
      }
    }

    drawFusedQrBorder(ctx, template, resolvedValues, layout);
    ctx.restore();

    if (layout.chipY !== null && layout.ctaLayout) {
      drawEditableCtaLabel(ctx, layout.ctaLayout, canvas.width, layout.chipY);
    }

    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export async function composeTemplatePreview({
  template,
  values,
  qrDataUrl,
  shortUrl,
  renderIntent = "display",
}: ComposeTemplatePreviewInput): Promise<string> {
  void shortUrl;
  const canvas = document.createElement("canvas");
  canvas.width = BASE_CANVAS_SIZE;
  canvas.height = BASE_CANVAS_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  const qrImage = await loadImage(qrDataUrl);
  const layout = resolveCompositionLayout(ctx, template, values, BASE_CANVAS_SIZE);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(layout.frameX, layout.frameY, layout.frameSize, layout.frameSize);
  strokeFrame(
    ctx,
    template,
    layout.frameX,
    layout.frameY,
    layout.frameSize,
    layout.frameSize,
    layout.scale,
    values,
    layout.chipY ?? undefined
  );
  drawTopLoop(ctx, template, layout.frameX, layout.frameY, layout.frameSize, layout.scale, values);

  ctx.save();
  beginFramePath(
    ctx,
    template,
    layout.frameX,
    layout.frameY,
    layout.frameSize,
    layout.frameSize,
    layout.frameContentInset,
    layout.scale
  );
  ctx.clip();

  ctx.fillStyle = "#ffffff";
  if (layout.qrSize > 0) {
    ctx.fillRect(layout.qrX, layout.qrY, layout.qrSize, layout.qrSize);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImage, layout.qrX, layout.qrY, layout.qrSize, layout.qrSize);
    ctx.imageSmoothingEnabled = true;

    const logoUrl = values.frame_logo_url?.trim();
    if (logoUrl) {
      try {
        const logoImage = await loadImage(logoUrl, isRemoteImageUrl(logoUrl) ? "anonymous" : null);
        const logoPad = Math.round(layout.qrSize * 0.03);
        const logoBox = Math.max(28, Math.round(layout.qrSize * 0.24));
        const centerX = layout.qrX + layout.qrSize / 2;
        const centerY = layout.qrY + layout.qrSize / 2;
        const logoX = Math.round(centerX - logoBox / 2);
        const logoY = Math.round(centerY - logoBox / 2);

        ctx.fillStyle = "#ffffff";
        drawRoundedRect(
          ctx,
          logoX - logoPad,
          logoY - logoPad,
          logoBox + logoPad * 2,
          logoBox + logoPad * 2,
          Math.max(6, Math.round(logoBox * 0.18))
        );
        ctx.fill();

        ctx.drawImage(logoImage, logoX, logoY, logoBox, logoBox);
      } catch (error) {
        console.warn("[composeTemplatePreview] Could not draw frame logo image.", {
          logoUrl,
          message: error instanceof Error ? error.message : String(error),
        });
        // Keep preview/export functional even if the logo URL is stale.
      }
    }
  }

  drawFusedQrBorder(ctx, template, values, layout);

  ctx.restore();

    if (layout.chipY !== null && layout.ctaLayout) {
      drawEditableCtaLabel(ctx, layout.ctaLayout, canvas.width, layout.chipY, renderIntent);
  }

  return canvas.toDataURL("image/png");
}
