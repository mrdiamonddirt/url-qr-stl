import * as QRCode from "qrcode";
import { QrCodeType } from "../types";

const UNSUPPORTED_QR_TYPE_REASONS: Record<Exclude<QrCodeType, "standard" | "frame">, string> = {
  micro: "Micro QR is not available in the current browser encoder.",
  rmqr: "rMQR needs a dedicated rectangular encoder that is not in this lightweight build.",
  iqr: "iQR requires a specialized encoder that is not available in this app.",
  sqrc: "SQRC requires a secure/private encoding layer and is not supported here.",
};

export function getQrTypeUnavailableReason(qrType: QrCodeType): string | null {
  if (qrType === "standard" || qrType === "frame") {
    return null;
  }
  return UNSUPPORTED_QR_TYPE_REASONS[qrType];
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

export async function toQrDataUrl(value: string, qrType: QrCodeType = "standard"): Promise<string> {
  const config = getQrEncodingConfig(qrType);
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: config.errorCorrectionLevel,
    margin: 1,
    width: 320,
    color: {
      dark: "#111111",
      light: "#ffffff",
    },
  });
}

export function buildQrMatrix(value: string, qrType: QrCodeType = "standard"): { size: number; data: boolean[] } {
  const config = getQrEncodingConfig(qrType);
  const qr = QRCode.create(value, { errorCorrectionLevel: config.errorCorrectionLevel });
  const size = qr.modules.size;
  const moduleData = Array.from(qr.modules.data as ArrayLike<number>);

  return {
    size,
    data: moduleData.map((entry: number) => Boolean(entry)),
  };
}
