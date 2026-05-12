#!/usr/bin/env node
// DB 연결 환경 점검 — `npm run db:check` 로 호출.
//
// 검사 대상:
//   1) .env.local 의 NEXT_PUBLIC_SUPABASE_URL → staging vs prod
//   2) supabase CLI 가 어디에 link 돼 있는지 (supabase/.temp/project-ref)
//   3) git 현재 브랜치 (참고용)
//
// 어떤 단계에서 prod ref 가 발견되면 빨갛게 경고. 모두 staging 이면 초록 OK.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const PROD_REF = "lcndkzfvrkwlzkyppdzh"; // DCbook (main → dcbook.vercel.app)
const STAGING_REF = "bqtxkkqgpgyviczyoqix"; // DCbookingproject (develop → dcbookspace.vercel.app)

const root = process.cwd();
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function readEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const url = text.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim();
  return url ?? null;
}

function readSupabaseLinkRef() {
  const path = resolve(root, "supabase/.temp/project-ref");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8").trim();
}

function detectEnv(s) {
  if (!s) return { env: "missing", color: YELLOW };
  if (s.includes(PROD_REF)) return { env: "PROD (DCbook)", color: RED };
  if (s.includes(STAGING_REF)) return { env: "STAGING (DCbookingproject)", color: GREEN };
  return { env: "unknown", color: YELLOW };
}

function currentBranch() {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch {
    return "(unknown)";
  }
}

console.log("");
console.log(`${BOLD}DB 연결 환경 점검${RESET}`);
console.log(DIM + "─".repeat(60) + RESET);

const branch = currentBranch();
console.log(`  ${DIM}git branch${RESET}        ${branch}`);

const envUrl = readEnvLocal();
const envCheck = detectEnv(envUrl);
console.log(
  `  ${DIM}.env.local URL${RESET}    ${envCheck.color}${envCheck.env}${RESET}`,
);
if (envUrl) console.log(`  ${DIM}                  → ${envUrl}${RESET}`);

const linkRef = readSupabaseLinkRef();
const linkCheck = detectEnv(linkRef);
console.log(
  `  ${DIM}supabase CLI link${RESET} ${linkCheck.color}${linkCheck.env}${RESET}`,
);
if (linkRef) console.log(`  ${DIM}                  → ${linkRef}${RESET}`);

console.log(DIM + "─".repeat(60) + RESET);

const anyProd = envCheck.env.startsWith("PROD") || linkCheck.env.startsWith("PROD");
if (anyProd) {
  console.log(
    `${RED}${BOLD}🚨 prod 연결이 감지되었습니다. 즉시 staging 으로 되돌리세요.${RESET}`,
  );
  console.log(
    `${RED}   .env.local URL/KEY 교체 + supabase link --project-ref ${STAGING_REF}${RESET}`,
  );
  console.log("");
  process.exit(1);
} else {
  console.log(`${GREEN}${BOLD}✅ 모두 staging — 안전${RESET}`);
  console.log("");
}
