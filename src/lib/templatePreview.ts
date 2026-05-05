import { QrTemplate } from "../types";

type ComposeTemplatePreviewInput = {
  template: QrTemplate;
  values: Record<string, string>;
  qrDataUrl: string;
  shortUrl: string;
};

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

function strokeFrame(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (template.borderStyle === "none") {
    return;
  }

  ctx.strokeStyle = template.accentColor;
  ctx.lineWidth = getFrameStrokeWidth(template);
  const outerInset = ctx.lineWidth / 2;

  beginFramePath(ctx, template, x, y, width, height, outerInset);

  ctx.stroke();

  if (template.borderStyle !== "fancy") {
    return;
  }

  ctx.lineWidth = 2.5;
  if (template.frameStyle === "rounded") {
    drawRoundedRect(ctx, x + 16, y + 16, width - 32, height - 32, 16);
  } else {
    ctx.beginPath();
    ctx.rect(x + 16, y + 16, width - 32, height - 32);
    ctx.closePath();
  }
  ctx.stroke();
}

function getFrameStrokeWidth(template: QrTemplate): number {
  if (template.borderStyle === "none") {
    return 0;
  }

  return template.borderStyle === "fancy" ? 8 : 6;
}

function beginFramePath(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  x: number,
  y: number,
  width: number,
  height: number,
  inset = 0
) {
  const drawX = x + inset;
  const drawY = y + inset;
  const drawWidth = Math.max(0, width - inset * 2);
  const drawHeight = Math.max(0, height - inset * 2);

  if (template.frameStyle === "rounded") {
    drawRoundedRect(ctx, drawX, drawY, drawWidth, drawHeight, 24);
    return;
  }

  if (template.frameStyle === "circle") {
    drawRoundedRect(ctx, drawX, drawY, drawWidth, drawHeight, 100);
    return;
  }

  ctx.beginPath();
  ctx.rect(drawX, drawY, drawWidth, drawHeight);
  ctx.closePath();
}

function drawTopLoop(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  frameX: number,
  frameY: number,
  frameSize: number
) {
  const loop = template.loopConfig;
  if (!loop) {
    return;
  }

  const centerX = frameX + frameSize / 2;
  const stemTop = frameY - loop.stemHeight;
  const loopCenterY = stemTop - loop.lift;

  ctx.fillStyle = template.accentColor;
  drawRoundedRect(
    ctx,
    centerX - loop.stemWidth / 2,
    stemTop,
    loop.stemWidth,
    loop.stemHeight,
    Math.min(loop.stemWidth / 3, 14)
  );
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, loopCenterY, loop.outerRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(centerX, loopCenterY, loop.innerRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

type ResolvedCtaLayout = {
  lines: string[];
  lineHeight: number;
  chipHeight: number;
  chipWidth: number;
  chipRadius: number;
  bottomInset: number;
  textSize: number;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function drawEditableCtaLabel(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  values: Record<string, string>,
  canvasSize: number,
  chipYOverride?: number
) {
  const layout = resolveCtaLayout(ctx, template, values);
  if (!layout) {
    return null;
  }

  const chipY = chipYOverride ?? canvasSize - layout.bottomInset - layout.chipHeight;
  const chipX = (canvasSize - layout.chipWidth) / 2;

  ctx.fillStyle = "#101418";
  drawRoundedRect(ctx, chipX, chipY, layout.chipWidth, layout.chipHeight, layout.chipRadius);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${layout.textSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textTop = chipY + layout.chipHeight / 2 - ((layout.lines.length - 1) * layout.lineHeight) / 2;
  layout.lines.forEach((line, index) => {
    ctx.fillText(line, chipX + layout.chipWidth / 2, textTop + index * layout.lineHeight);
  });
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  return {
    chipY,
    chipHeight: layout.chipHeight,
  };
}

function resolveCtaLayout(
  ctx: CanvasRenderingContext2D,
  template: QrTemplate,
  values: Record<string, string>
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

    const textSize = 21;
    ctx.font = `800 ${textSize}px 'Segoe UI', sans-serif`;
    const lines = wrapTextLines(ctx, label, 220, 2);
    const lineHeight = 22;
    const chipHeight = Math.max(42, lines.length * lineHeight + 10);
    const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const chipPaddingX = 16;
    const chipWidth = clampNumber(maxLineWidth + chipPaddingX * 2, 126, 220 + chipPaddingX * 2);

    return {
      lines,
      lineHeight,
      chipHeight,
      chipWidth,
      chipRadius: Math.max(17, Math.floor(chipHeight / 2) - 1),
      bottomInset: 30,
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
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${size}px 'Segoe UI', sans-serif`;
  const lines = wrapTextLines(ctx, label, config.maxWidth, config.maxLines);
  const lineHeight = Math.max(14, Math.round(size * 1.05));
  const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
  const chipHeight = Math.max(config.chipHeight, contentHeight + 10);
  const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
  const chipWidth = clampNumber(
    maxLineWidth + config.chipPaddingX * 2,
    126,
    config.maxWidth + config.chipPaddingX * 2
  );

  return {
    lines,
    lineHeight,
    chipHeight,
    chipWidth,
    chipRadius: Math.max(config.chipRadius, Math.floor(chipHeight / 2) - 1),
    bottomInset: config.chipBottomInset,
    textSize: size,
  };
}

export async function composeTemplatePreview({
  template,
  values,
  qrDataUrl,
  shortUrl,
}: ComposeTemplatePreviewInput): Promise<string> {
  void shortUrl;
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 480;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  const qrImage = await loadImage(qrDataUrl);
  const frameInset = template.borderStyle === "none" ? 32 : 22;
  const loopExtraTop = template.loopConfig
    ? template.loopConfig.outerRadius + template.loopConfig.stemHeight + template.loopConfig.lift + 10
    : 0;
  const frameTop = frameInset + loopExtraTop;
  const frameBottom = canvas.height - frameInset;
  const frameSize = Math.min(canvas.width - frameInset * 2, frameBottom - frameTop);
  const frameX = (canvas.width - frameSize) / 2;
  const frameY = frameTop;
  const frameStrokeWidth = getFrameStrokeWidth(template);
  const frameContentInset = frameStrokeWidth > 0 ? frameStrokeWidth / 2 + 1 : 0;
  const qrInset = template.borderStyle === "fancy" ? 38 : template.borderStyle === "simple" ? 28 : 20;
  const ctaLayout = resolveCtaLayout(ctx, template, values);
  const ctaGap = 12;
  const contentBottom = frameY + frameSize - frameContentInset;
  const chipY = ctaLayout ? contentBottom - ctaLayout.bottomInset - ctaLayout.chipHeight : null;
  const qrY = frameY + frameContentInset + qrInset;
  const maxQrSizeFromFrame = frameSize - (frameContentInset + qrInset) * 2;
  const maxQrSizeFromCta = chipY === null ? maxQrSizeFromFrame : chipY - ctaGap - qrY;
  const qrSize = Math.max(0, Math.min(maxQrSizeFromFrame, maxQrSizeFromCta));
  const qrX = frameX + (frameSize - qrSize) / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(frameX, frameY, frameSize, frameSize);
  strokeFrame(ctx, template, frameX, frameY, frameSize, frameSize);
  drawTopLoop(ctx, template, frameX, frameY, frameSize);

  ctx.save();
  beginFramePath(ctx, template, frameX, frameY, frameSize, frameSize, frameContentInset);
  ctx.clip();

  ctx.fillStyle = "#ffffff";
  if (qrSize > 0) {
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
  }

  if (chipY !== null) {
    drawEditableCtaLabel(ctx, template, values, canvas.width, chipY);
  }

  ctx.restore();

  return canvas.toDataURL("image/png");
}