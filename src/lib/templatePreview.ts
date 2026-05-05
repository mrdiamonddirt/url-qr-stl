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

export async function composeTemplatePreview({
  template,
  values,
  qrDataUrl,
  shortUrl,
}: ComposeTemplatePreviewInput): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 420;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  const qrImage = await loadImage(qrDataUrl);
  const accent = template.accentColor;
  const line1 = values.line1 ?? template.fields[0]?.defaultValue ?? "";
  const line2 = values.line2 ?? template.fields[1]?.defaultValue ?? "";

  ctx.fillStyle = "#f5f7fa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (template.frameStyle === "rounded") {
    drawRoundedRect(ctx, 24, 24, canvas.width - 48, canvas.height - 48, 26);
  } else if (template.frameStyle === "circle") {
    drawRoundedRect(ctx, 24, 24, canvas.width - 48, canvas.height - 48, 100);
  } else {
    ctx.beginPath();
    ctx.rect(24, 24, canvas.width - 48, canvas.height - 48);
    ctx.closePath();
  }

  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = accent;
  ctx.stroke();

  const qrSize = 228;
  const qrX = 44;
  const qrY = 96;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = accent;
  ctx.font = "700 34px 'Segoe UI', sans-serif";
  ctx.fillText(template.name.toUpperCase(), 300, 132);

  ctx.fillStyle = "#15243a";
  ctx.font = "700 28px 'Segoe UI', sans-serif";
  ctx.fillText(line1, 300, 196);
  ctx.font = "600 25px 'Segoe UI', sans-serif";
  ctx.fillText(line2, 300, 242);

  ctx.fillStyle = "#53627d";
  ctx.font = "500 18px 'Segoe UI', sans-serif";
  ctx.fillText(shortUrl, 300, 296);

  ctx.fillStyle = "#6a7a96";
  ctx.font = "500 15px 'Segoe UI', sans-serif";
  ctx.fillText(template.description, 44, 366);

  return canvas.toDataURL("image/png");
}