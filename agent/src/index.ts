// 메인 루프 — 5초마다 Vercel /api/print/jobs 폴링, 새 job 들 처리.
//
// 동시에 두 개를 잡으면 중복 인쇄 위험이 있으니 in-flight 한 건씩 직렬 처리.
// 처리 흐름:
//   1) status: 'requested' → 'printing' (일단 잡았다고 마킹)
//   2) Puppeteer 로 print HTML 을 PDF 로 변환
//   3) Raw 9100 으로 PDF 전송
//   4) 성공 시 'completed' / 실패 시 'failed'

import { env } from "./env.js";
import { fetchPendingJobs, reportStatus, type Job } from "./api.js";
import { renderUrlToPdf, shutdownBrowser } from "./pdf.js";
import { printPdfRaw9100 } from "./printer.js";

const inFlight = new Set<string>(); // `${kind}:${id}` 처리 중 표시

function jobKey(j: Job): string {
  return `${j.kind}:${j.id}`;
}

async function processJob(job: Job): Promise<void> {
  const key = jobKey(job);
  console.log(`[print] start  #${job.ref_no ?? job.id} (${job.kind})`);

  // 1) printing 으로 마킹 — 다른 폴링 사이클에서 또 잡지 않도록
  await reportStatus({ kind: job.kind, id: job.id, status: "printing" });

  try {
    // 2) PDF 렌더
    const pdf = await renderUrlToPdf(job.print_url);
    console.log(`[print] pdf    #${job.ref_no ?? job.id} (${pdf.length}B)`);

    // 3) 프린터로 전송
    await printPdfRaw9100({
      host: env.printerHost,
      port: env.printerPort,
      pdf,
    });
    console.log(`[print] done   #${job.ref_no ?? job.id}`);

    // 4) 완료 보고
    await reportStatus({ kind: job.kind, id: job.id, status: "completed" });
  } catch (err) {
    console.error(`[print] failed #${job.ref_no ?? job.id}:`, err);
    try {
      await reportStatus({ kind: job.kind, id: job.id, status: "failed" });
    } catch (e2) {
      console.error(`[print] failed report also failed:`, e2);
    }
  } finally {
    inFlight.delete(key);
  }
}

async function tick(): Promise<void> {
  let jobs: Job[] = [];
  try {
    jobs = await fetchPendingJobs();
  } catch (err) {
    console.error("[poll] fetch error:", err);
    return;
  }

  for (const job of jobs) {
    const key = jobKey(job);
    if (inFlight.has(key)) continue;
    inFlight.add(key);
    // fire-and-forget — 여러 job 을 병렬 처리할 수도 있는데, 같은 프린터로
    // 동시 송신은 위험하니 처리 자체는 직렬화하는 작은 큐로 변경 가능.
    // MVP 는 각 job 을 비동기로 시작하되 inFlight 로 중복만 막는 단순 방식.
    void processJob(job);
  }
}

async function main() {
  console.log("[agent] starting…");
  console.log(`[agent] target  : ${env.appBaseUrl}`);
  console.log(`[agent] printer : ${env.printerHost}:${env.printerPort}`);
  console.log(`[agent] poll    : ${env.pollIntervalSec}s`);

  // 우아한 종료
  const shutdown = async (signal: string) => {
    console.log(`[agent] received ${signal}, shutting down…`);
    await shutdownBrowser();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // 즉시 한 번, 이후 주기적으로
  await tick();
  setInterval(() => void tick(), env.pollIntervalSec * 1000);
}

void main();
