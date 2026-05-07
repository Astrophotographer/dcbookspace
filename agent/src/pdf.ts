// HTML 인쇄 페이지를 PDF 바이너리로 렌더.
//
// Puppeteer 한 인스턴스를 재사용 (process 단위). 매 요청마다 launch/close 하면
// Chromium 부팅 비용이 큼.

import puppeteer, { type Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browserPromise;
}

/**
 * 주어진 URL 의 page 를 A4 PDF 로 렌더 후 Buffer 반환.
 * print 페이지는 @media print 스타일이 적용되도록 emulateMediaType("print") 호출.
 */
export async function renderUrlToPdf(url: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    const data = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    });
    return Buffer.from(data);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  if (b) await b.close().catch(() => {});
}
