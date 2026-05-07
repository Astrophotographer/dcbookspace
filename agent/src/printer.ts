// Raw 9100 (TCP socket) 인쇄 — Sindoh D450 같은 네트워크 프린터의 표준 흐름.
// PDF 바이너리를 그대로 9100 포트로 stream 하면 프린터가 받아 처리.

import net from "node:net";

export async function printPdfRaw9100(args: {
  host: string;
  port: number;
  pdf: Buffer;
}): Promise<void> {
  const { host, port, pdf } = args;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve();
    };

    // 30초 안에 connect/write/close 다 끝나야 함. 평소엔 1~2초.
    socket.setTimeout(30_000);
    socket.on("timeout", () =>
      finish(new Error("printer connection timeout (30s)")),
    );
    socket.on("error", (err) => finish(err));

    socket.connect(port, host, () => {
      socket.write(pdf, (writeErr) => {
        if (writeErr) {
          finish(writeErr);
          return;
        }
        // write callback 후 end() 로 정상 종료. 프린터가 ack 돌리면 close 됨.
        socket.end();
      });
    });

    // 프린터가 정상 close 하면 성공
    socket.on("close", (hadError) => {
      if (!settled) {
        if (hadError) finish(new Error("printer closed with error"));
        else finish();
      }
    });
  });
}
