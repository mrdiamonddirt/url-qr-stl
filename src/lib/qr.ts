import * as QRCode from "qrcode";
import { Qrean, type Image as QreanImage } from "qrean";
import { QrCodeType } from "../types";

const UNSUPPORTED_QR_TYPE_REASONS: Record<"iqr" | "sqrc", string> = {
  iqr: "iQR requires a specialized encoder that is not available in this app.",
  sqrc: "SQRC requires a secure/private encoding layer and is not supported here.",
};

const PREMIUM_QR_TYPES: ReadonlySet<QrCodeType> = new Set(["frame", "micro", "rmqr", "iqr"]);

let qreanPromise: Promise<Qrean> | null = null;

type Rgba = { r: number; g: number; b: number; a: number };

function getQrean(): Promise<Qrean> {
  if (!qreanPromise) {
    qreanPromise = Qrean.create();
  }
  return qreanPromise;
}

function parseHexColor(color: string | undefined, fallback: Rgba): Rgba {
  if (!color) {
    return fallback;
  }

  const normalized = color.startsWith("#") ? color.slice(1) : color;
  if (normalized.length === 6 || normalized.length === 8) {
    const value = Number.parseInt(normalized, 16);
    if (!Number.isNaN(value)) {
      if (normalized.length === 6) {
        return {
          r: (value >> 16) & 0xff,
          g: (value >> 8) & 0xff,
          b: value & 0xff,
          a: 255,
        };
      }

      return {
        r: (value >> 24) & 0xff,
        g: (value >> 16) & 0xff,
        b: (value >> 8) & 0xff,
        a: value & 0xff,
      };
    }
  }

  return fallback;
}

function buildDataUrlFromQreanImage(image: QreanImage, colorOptions: QrColorOptions): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  const dark = parseHexColor(colorOptions.darkColor, { r: 17, g: 17, b: 17, a: 255 });
  const light = parseHexColor(colorOptions.lightColor, { r: 255, g: 255, b: 255, a: 255 });
  const tinted = new Uint8ClampedArray(image.data.length);

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const isDark = image.data[offset] < 128;
    const color = isDark ? dark : light;
    tinted[offset] = color.r;
    tinted[offset + 1] = color.g;
    tinted[offset + 2] = color.b;
    tinted[offset + 3] = color.a;
  }

  context.putImageData(new ImageData(tinted, image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

async function toAdvancedQrDataUrl(
  value: string,
  qrType: Extract<QrCodeType, "micro" | "rmqr">,
  colorOptions: QrColorOptions
): Promise<string> {
  const encoder = await getQrean();
  const image = await encoder.encode(value, {
    codeType: qrType === "micro" ? "mQR" : "rMQR",
    qrErrorLevel: "M",
    scale: 8,
    padding: 8,
  });

  if (!image) {
    throw new Error(
      qrType === "micro"
        ? "Micro QR could not encode this content. Try a shorter URL or choose another QR type."
        : "rMQR could not encode this content. Try a shorter URL or choose another QR type."
    );
  }

  return buildDataUrlFromQreanImage(image, colorOptions);
}

export function isPremiumQrType(qrType: QrCodeType): boolean {
  return PREMIUM_QR_TYPES.has(qrType);
}

export function getQrTypeUnavailableReason(qrType: QrCodeType): string | null {
  if (qrType === "standard" || qrType === "frame" || qrType === "micro" || qrType === "rmqr") {
    return null;
  }
  return UNSUPPORTED_QR_TYPE_REASONS[qrType as "iqr" | "sqrc"];
}

function getQrEncodingConfig(qrType: QrCodeType): { errorCorrectionLevel: "M" | "H" } {
  const unavailable = getQrTypeUnavailableReason(qrType);
  if (unavailable) {
    throw new Error(unavailable);
  }

  return {
    errorCorrectionLevel: qrType === "frame" ? "H" : "M",
  };
}

type QrColorOptions = {
  darkColor?: string;
  lightColor?: string;
};

export async function toQrDataUrl(
  value: string,
  qrType: QrCodeType = "standard",
  colorOptions: QrColorOptions = {}
): Promise<string> {
  if (qrType === "micro" || qrType === "rmqr") {
    return toAdvancedQrDataUrl(value, qrType, colorOptions);
  }

  const config = getQrEncodingConfig(qrType);
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: config.errorCorrectionLevel,
    margin: 1,
    width: 320,
    color: {
      dark: colorOptions.darkColor ?? "#111111",
      light: colorOptions.lightColor ?? "#ffffff",
    },
  });
}

export function buildQrMatrix(value: string, qrType: QrCodeType = "standard"): { size: number; data: boolean[] } {
  if (qrType === "micro" || qrType === "rmqr") {
    throw new Error("Direct module matrix export is unavailable for this QR type in the current renderer path.");
  }

  const config = getQrEncodingConfig(qrType);
  const qr = QRCode.create(value, { errorCorrectionLevel: config.errorCorrectionLevel });
  const size = qr.modules.size;
  const moduleData = Array.from(qr.modules.data as ArrayLike<number>);

  return {
    size,
    data: moduleData.map((entry: number) => Boolean(entry)),
  };
}
