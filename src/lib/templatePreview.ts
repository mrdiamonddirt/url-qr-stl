import { QrTemplate } from "../types";

type ComposeTemplatePreviewInput = {
  template: QrTemplate;
  values: Record<string, string>;
  qrDataUrl: string;
  shortUrl: string;
};

type ResolvedCtaLayout = {
  lines: string[];
  lineHeight: number;
  chipHeight: number;
  chipWidth: number;
  chipRadius: number;
  bottomInset: number;
  textSize: number;
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

const BASE_CANVAS_SIZE = 480;
const SELECTOR_PREVIEW_SIZE = 232;
const CTA_FONT_STACK = "'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load QR preview image."));
    image.src = src;
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function getFrameStrokeWidth(template: QrTemplate, scale = 1): number {
  if (template.borderStyle === "none") {
    return 0;
  }

  const baseWidth = template.borderStyle === "fancy" ? 8 : 6;
  return baseWidth * scale;
}

function strokeFrame(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  x: number,
  y: number,
  width: number,
  height: number,
  scale = 1
) {
  if (template.borderStyle === "none") {
    return;
  }

  ctx.strokeStyle = template.accentColor;
  ctx.lineWidth = getFrameStrokeWidth(template, scale);
  const outerInset = ctx.lineWidth / 2;

  beginFramePath(ctx, template, x, y, width, height, outerInset, scale);
  ctx.stroke();

  if (template.borderStyle !== "fancy") {
    return;
  }

  ctx.lineWidth = Math.max(1.2, 2.5 * scale);
  const decorativeInset = 16 * scale;
  if (template.frameStyle === "rounded") {
    drawRoundedRect(
      ctx,
      x + decorativeInset,
      y + decorativeInset,
      width - decorativeInset * 2,
      height - decorativeInset * 2,
      16 * scale
    );
  } else {
    ctx.beginPath();
    ctx.rect(x + decorativeInset, y + decorativeInset, width - decorativeInset * 2, height - decorativeInset * 2);
    ctx.closePath();
  }
  ctx.stroke();
}

function drawTopLoop(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  frameX: number,
  frameY: number,
  frameSize: number,
  scale = 1
) {
  const loop = template.loopConfig;
  if (!loop) {
    return;
  }

  const centerX = frameX + frameSize / 2;
  const stemHeight = loop.stemHeight * scale;
  const stemWidth = loop.stemWidth * scale;
  const outerRadius = loop.outerRadius * scale;
  const innerRadius = loop.innerRadius * scale;
  const lift = loop.lift * scale;
  const stemTop = frameY - stemHeight;
  const loopCenterY = stemTop - lift;

  ctx.fillStyle = template.accentColor;
  drawRoundedRect(
    ctx,
    centerX - stemWidth / 2,
    stemTop,
    stemWidth,
    stemHeight,
    Math.min(stemWidth / 3, 14 * scale)
  );
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
  scale = 1
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
    ctx.font = `800 ${textSize}px ${CTA_FONT_STACK}`;
    const lines = wrapTextLines(ctx, label, 220 * scale, 2);
    const lineHeight = Math.max(11 * scale, textSize * 1.04);
    const chipHeight = Math.max(42 * scale, lines.length * lineHeight + 10 * scale);
    const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const chipPaddingX = 16 * scale;
    const chipWidth = clampNumber(maxLineWidth + chipPaddingX * 2, 126 * scale, 252 * scale);

    return {
      lines,
      lineHeight,
      chipHeight,
      chipWidth,
      chipRadius: Math.max(17 * scale, Math.floor(chipHeight / 2) - 1),
      bottomInset: 30 * scale,
      textSize,
    };
  }

  const fallbackText = template.ctaLabel ?? "";
  const rawLabel = values[config.fieldKey] ?? fallbackText;
  const label = rawLabel.replace(/\s+/g, " ").trim() || fallbackText;
  if (!label) {
    return null;
  }

  const rawSize = Number(values[config.sizeKey]);
  const size = clampNumber(
    Number.isFinite(rawSize) ? rawSize : config.defaultSizePx,
    config.minSizePx,
    config.maxSizePx
  ) * scale;

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${size}px ${CTA_FONT_STACK}`;
  const lines = wrapTextLines(ctx, label, config.maxWidth * scale, config.maxLines);
  const lineHeight = Math.max(14 * scale, Math.round(size * 1.05));
  const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
  const chipHeight = Math.max(config.chipHeight * scale, contentHeight + 10 * scale);
  const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
  const chipWidth = clampNumber(
    maxLineWidth + config.chipPaddingX * scale * 2,
    126 * scale,
    (config.maxWidth + config.chipPaddingX * 2) * scale
  );

  return {
    lines,
    lineHeight,
    chipHeight,
    chipWidth,
    chipRadius: Math.max(config.chipRadius * scale, Math.floor(chipHeight / 2) - 1),
    bottomInset: config.chipBottomInset * scale,
    textSize: size,
  };
}

function drawEditableCtaLabel(
  ctx: CanvasRenderingContext2D,
  layout: ResolvedCtaLayout,
  canvasSize: number,
  chipYOverride?: number
) {
  const chipY = chipYOverride ?? canvasSize - layout.bottomInset - layout.chipHeight;
  const chipX = (canvasSize - layout.chipWidth) / 2;

  ctx.fillStyle = "#101418";
  drawRoundedRect(ctx, chipX, chipY, layout.chipWidth, layout.chipHeight, layout.chipRadius);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${layout.textSize}px ${CTA_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textTop = chipY + layout.chipHeight / 2 - ((layout.lines.length - 1) * layout.lineHeight) / 2;
  layout.lines.forEach((line, index) => {
    ctx.fillText(line, chipX + layout.chipWidth / 2, textTop + index * layout.lineHeight);
  });
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function buildDefaultTemplateValues(template: QrTemplate): Record<string, string> {
  const values = template.fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.defaultValue;
    return acc;
  }, {});

  if (template.ctaConfig) {
    values[template.ctaConfig.fieldKey] = values[template.ctaConfig.fieldKey] ?? template.ctaLabel ?? "";
    values[template.ctaConfig.sizeKey] = String(template.ctaConfig.defaultSizePx);
  }

  return values;
}

function resolveQrInset(template: QrTemplate, frameSize: number, scale: number): number {
  if (template.borderStyle === "fancy") {
    return clampNumber(frameSize * 0.082, 24 * scale, 36 * scale);
  }

  if (template.borderStyle === "simple") {
    return clampNumber(frameSize * 0.06, 16 * scale, 26 * scale);
  }

  return clampNumber(frameSize * 0.042, 10 * scale, 18 * scale);
}

function resolveCompositionLayout(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  values: Record<string, string>,
  canvasSize: number
): CompositionLayout {
  const scale = canvasSize / BASE_CANVAS_SIZE;
  const frameInset = (template.borderStyle === "none" ? 32 : 22) * scale;
  const loopExtraTop = template.loopConfig
    ? (template.loopConfig.outerRadius + template.loopConfig.stemHeight + template.loopConfig.lift + 10) * scale
    : 0;
  const frameTop = frameInset + loopExtraTop;
  const frameBottom = canvasSize - frameInset;
  const frameSize = Math.min(canvasSize - frameInset * 2, frameBottom - frameTop);
  const frameX = (canvasSize - frameSize) / 2;
  const frameY = frameTop;
  const frameStrokeWidth = getFrameStrokeWidth(template, scale);
  const frameContentInset = frameStrokeWidth > 0 ? frameStrokeWidth / 2 + 1 * scale : 0;
  const qrInset = resolveQrInset(template, frameSize, scale);
  const ctaLayout = resolveCtaLayout(ctx, template, values, scale);
  const ctaGap = Math.max(6 * scale, frameSize * 0.02);
  const contentBottom = frameY + frameSize - frameContentInset;
  const chipY = ctaLayout ? contentBottom - ctaLayout.bottomInset - ctaLayout.chipHeight : null;
  const qrY = frameY + frameContentInset + qrInset;
  const maxQrSizeFromFrame = frameSize - (frameContentInset + qrInset) * 2;
  const maxQrSizeFromCta = chipY === null ? maxQrSizeFromFrame : chipY - ctaGap - qrY;
  const qrSize = Math.max(0, Math.min(maxQrSizeFromFrame, maxQrSizeFromCta));
  const qrX = frameX + (frameSize - qrSize) / 2;

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

export function composeTemplateSelectorPreview(
  template: QrTemplate,
  values?: Record<string, string>
): string {
  const canvas = document.createElement("canvas");
  canvas.width = SELECTOR_PREVIEW_SIZE;
  canvas.height = SELECTOR_PREVIEW_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  const resolvedValues = { ...buildDefaultTemplateValues(template), ...(values ?? {}) };
  const layout = resolveCompositionLayout(ctx, template, resolvedValues, SELECTOR_PREVIEW_SIZE);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(layout.frameX, layout.frameY, layout.frameSize, layout.frameSize);
  strokeFrame(ctx, template, layout.frameX, layout.frameY, layout.frameSize, layout.frameSize, layout.scale);
  drawTopLoop(ctx, template, layout.frameX, layout.frameY, layout.frameSize, layout.scale);

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
    drawDemoQrPattern(ctx, layout.qrX, layout.qrY, layout.qrSize);
  }

  if (layout.chipY !== null && layout.ctaLayout) {
    drawEditableCtaLabel(ctx, layout.ctaLayout, canvas.width, layout.chipY);
  }

  ctx.restore();
  return canvas.toDataURL("image/png");
}

export async function composeTemplatePreview({
  template,
  values,
  qrDataUrl,
  shortUrl,
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
  strokeFrame(ctx, template, layout.frameX, layout.frameY, layout.frameSize, layout.frameSize, layout.scale);
  drawTopLoop(ctx, template, layout.frameX, layout.frameY, layout.frameSize, layout.scale);

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
  }

  if (layout.chipY !== null && layout.ctaLayout) {
    drawEditableCtaLabel(ctx, layout.ctaLayout, canvas.width, layout.chipY);
  }

  ctx.restore();

  return canvas.toDataURL("image/png");
}
