// Vercel /api/print/* 호출 래퍼.

import { env } from "./env.js";

export type Job = {
  kind: "reservation" | "series";
  id: string;
  ref_no: string | null;
  /** 서버가 만들어 준 인쇄용 HTML URL — 그대로 fetch 해서 PDF 로 변환 */
  print_url: string;
};

const headers = () => ({
  authorization: `Bearer ${env.agentToken}`,
  "content-type": "application/json",
});

export async function fetchPendingJobs(): Promise<Job[]> {
  const res = await fetch(`${env.appBaseUrl}/api/print/jobs`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`jobs fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { jobs: Job[] };
  return data.jobs ?? [];
}

export async function reportStatus(args: {
  kind: "reservation" | "series";
  id: string;
  status: "printing" | "completed" | "failed";
}): Promise<void> {
  const res = await fetch(`${env.appBaseUrl}/api/print/status`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`status report failed: ${res.status} ${await res.text()}`);
  }
}
