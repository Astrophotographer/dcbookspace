import QRCode from "qrcode";

export async function qrDataUrl(text: string, size = 180): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
