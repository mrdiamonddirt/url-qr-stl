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
  ctx.lineWidth = template.borderStyle === "fancy" ? 8 : 6;

  if (template.frameStyle === "rounded") {
    drawRoundedRect(ctx, x, y, width, height, 24);
  } else if (template.frameStyle === "circle") {
    drawRoundedRect(ctx, x, y, width, height, 100);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.closePath();
  }

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

function drawCtaLabel(ctx: CanvasRenderingContext2D, label: string, canvasSize: number) {
  const chipWidth = Math.min(210, Math.max(126, label.length * 13));
  const chipHeight = 42;
  const chipX = (canvasSize - chipWidth) / 2;
  const chipY = canvasSize - 72;

  ctx.fillStyle = "#101418";
  drawRoundedRect(ctx, chipX, chipY, chipWidth, chipHeight, 17);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 21px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, chipX + chipWidth / 2, chipY + chipHeight / 2 + 1);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export async function composeTemplatePreview({
  template,
  values,
  qrDataUrl,
  shortUrl,
}: ComposeTemplatePreviewInput): Promise<string> {
  void values;
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
  const ctaReserve = template.ctaLabel ? 54 : 0;
  const frameSize = canvas.width - frameInset * 2;
  const qrInset = template.borderStyle === "fancy" ? 38 : template.borderStyle === "simple" ? 28 : 20;
  const qrSize = frameSize - qrInset * 2;
  const frameX = frameInset;
  const frameY = frameInset;
  const qrX = frameX + qrInset;
  const qrY = frameY + qrInset - Math.floor(ctaReserve / 3);

  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(frameX, frameY, frameSize, frameSize);
  strokeFrame(ctx, template, frameX, frameY, frameSize, frameSize);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX, qrY, qrSize, qrSize);
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  if (template.ctaLabel) {
    drawCtaLabel(ctx, template.ctaLabel, canvas.width);
  }

  return canvas.toDataURL("image/png");
}