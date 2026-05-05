import * as QRCode from "qrcode";

export async function toQrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    margin: 1,
    width: 320,
    color: {
      dark: "#111111",
      light: "#ffffff",
    },
  });
}

export function buildQrMatrix(value: string): { size: number; data: boolean[] } {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const moduleData = Array.from(qr.modules.data as ArrayLike<number>);

  return {
    size,
    data: moduleData.map((entry: number) => Boolean(entry)),
  };
}
