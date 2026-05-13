import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { adminLogout } from "@/lib/admin-actions";
import { createServiceClient } from "@/lib/supabase/server";
import {
  AlertTriangle,
  Bell,
  Building,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  Clock,
  FileText,
  Inbox,
  LogOut,
  Maximize2,
  Megaphone,
  Network,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPrintEnabled } from "@/lib/site-settings";

const TILES = [
  {
    href: "/admin/admins",
    label: "관리자정보",
    desc: "관리자 추가·삭제, 마스터 PIN 발급",
    Icon: ShieldCheck,
  },
  {
    href: "/admin/notifications",
    label: "관리자 알림",
    desc: "강제 중복 신청 발생 시 이 폰으로 받기 — ON/OFF 토글",
    Icon: Bell,
  },
  {
    href: "/admin/users",
    label: "결재자정보",
    desc: "결재자 등록 및 PIN 관리",
    Icon: Users,
  },
  {
    href: "/admin/reservations",
    label: "신청서관리",
    desc: "전체 신청 내역, 결재 상태, 강제 확정/취소",
    Icon: FileText,
  },
  {
    href: "/admin/notices",
    label: "공지관리",
    desc: "공지사항 제목과 내용을 작성·수정",
    Icon: Megaphone,
  },
  {
    href: "/admin/departments",
    label: "부서관리",
    desc: "부서 생성·삭제·이름 변경, 부서장·담당장로 등록",
    Icon: Briefcase,
  },
  {
    href: "/admin/rooms",
    label: "건물·호실",
    desc: "건물·층·호실 관리",
    Icon: Building,
  },
  {
    href: "/admin/routes",
    label: "결재선",
    desc: "결재 단계 템플릿 관리",
    Icon: Network,
  },
  {
    href: "/admin/fixed-events",
    label: "고정행사·예배",
    desc: "주일 예배 등 매주 정기 일정 관리",
    Icon: CalendarClock,
  },
  {
    href: "/admin/apply-qr",
    label: "신청 QR",
    desc: "휴대폰으로 스캔 시 신청서 바로 열림",
    Icon: QrCode,
  },
  {
    href: "/kiosk-install",
    label: "키오스크 설치",
    desc: "사무실 단말에 키오스크 모드 PWA 로 설치 안내",
    Icon: Maximize2,
  },
  {
    href: "/admin/settings",
    label: "프린트ON/OFF",
    desc: "프린트 자동 출력·진행상태·재출력 버튼 일괄 ON/OFF",
    Icon: SettingsIcon,
  },
];

/**
 * 한국시간 기준 "이번 주 시작(일요일 00:00)" 과 "이번 주 + 7일" 의 ISO.
 * Vercel/Supabase 모두 UTC 기반이라 KST(+9) 오프셋을 명시.
 */
function weekRange(): { weekStart: string; nextWeekEnd: string; today: string } {
  const now = new Date();
  // 한국시간으로 변환: UTC + 9h.
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dow = kstNow.getUTCDay(); // 0=일요일
  const weekStartKst = new Date(kstNow);
  weekStartKst.setUTCDate(kstNow.getUTCDate() - dow);
  weekStartKst.setUTCHours(0, 0, 0, 0);
  const nextWeekEndKst = new Date(weekStartKst);
  nextWeekEndKst.setUTCDate(weekStartKst.getUTCDate() + 14); // 이번 주 + 다음 주

  // KST 자정을 ISO(+09:00) 로 다시 표현
  const fmt = (d: Date) =>
    `${d.toISOString().slice(0, 10)}T00:00:00+09:00`;
  return {
    weekStart: fmt(weekStartKst),
    nextWeekEnd: fmt(nextWeekEndKst),
    today: kstNow.toISOString().slice(0, 10),
  };
}

async function fetchStats() {
  const supabase = createServiceClient();
  const { weekStart, nextWeekEnd, today } = weekRange();

  // 모두 head:true 로 row 안 가져오고 count 만 — 최소 부하.
  const pendingP = supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const newThisWeekP = supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekStart);
  const upcomingApprovedP = supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .gte("start_at", `${today}T00:00:00+09:00`)
    .lte("start_at", nextWeekEnd);
  const printFailedP = supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "approved"])
    .eq("print_status", "failed");

  const [pendingR, newR, upcomingR, printFailR] = await Promise.all([
    pendingP,
    newThisWeekP,
    upcomingApprovedP,
    printFailedP,
  ]);

  return {
    pending: pendingR.count ?? 0,
    newThisWeek: newR.count ?? 0,
    upcoming: upcomingR.count ?? 0,
    printFail: printFailR.count ?? 0,
  };
}

export default async function AdminHome() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <SetupNeeded />
        </main>
      </>
    );
  }

  const [stats, printEnabled] = await Promise.all([
    fetchStats(),
    getPrintEnabled(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">관리</h1>
          {/* 로그아웃 — admin 쿠키 클리어. 사이트 어디서든 헤더 "관리자 · 활성화중"
              은 단순 링크로만 작동하고, 실제 모드 해제는 여기서만 가능. */}
          <form action={adminLogout}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
              title="관리자 모드를 끕니다"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              로그아웃
            </button>
          </form>
        </div>

        {/* 한눈에 보는 운영 지표 — count 쿼리 4개로 가볍게 */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="결재 대기"
            value={stats.pending}
            unit="건"
            href="/admin/reservations"
            Icon={Clock}
            tone="amber"
          />
          <StatCard
            label="이번 주 신규 신청"
            value={stats.newThisWeek}
            unit="건"
            href="/admin/reservations"
            Icon={Inbox}
            tone="sky"
          />
          <StatCard
            label="2주 내 확정 예약"
            value={stats.upcoming}
            unit="건"
            href="/admin/reservations"
            Icon={CalendarCheck}
            tone="emerald"
          />
          {printEnabled && (
            <StatCard
              label="인쇄 실패"
              value={stats.printFail}
              unit="건"
              href="/admin/reservations"
              Icon={AlertTriangle}
              tone={stats.printFail > 0 ? "red" : "stone"}
              emphasized={stats.printFail > 0}
            />
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:bg-stone-50"
            >
              <t.Icon className="mt-0.5 h-6 w-6 text-brand-600" />
              <div>
                <div className="text-lg font-semibold">{t.label}</div>
                <div className="text-sm text-stone-500">{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

type Tone = "amber" | "sky" | "emerald" | "red" | "stone";

const TONE_CLASS: Record<
  Tone,
  { bg: string; ring: string; icon: string; value: string }
> = {
  amber: {
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    icon: "text-amber-600",
    value: "text-amber-900",
  },
  sky: {
    bg: "bg-sky-50",
    ring: "ring-sky-200",
    icon: "text-sky-600",
    value: "text-sky-900",
  },
  emerald: {
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
    icon: "text-emerald-600",
    value: "text-emerald-900",
  },
  red: {
    bg: "bg-red-50",
    ring: "ring-red-200",
    icon: "text-red-600",
    value: "text-red-900",
  },
  stone: {
    bg: "bg-stone-50",
    ring: "ring-stone-200",
    icon: "text-stone-500",
    value: "text-stone-700",
  },
};

function StatCard({
  label,
  value,
  unit,
  href,
  Icon,
  tone,
  emphasized = false,
}: {
  label: string;
  value: number;
  unit: string;
  href: string;
  Icon: typeof Clock;
  tone: Tone;
  emphasized?: boolean;
}) {
  const t = TONE_CLASS[tone];
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col rounded-2xl p-4 shadow-sm transition-colors ring-1",
        t.bg,
        t.ring,
        emphasized ? "hover:brightness-95" : "hover:bg-white",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-stone-600">{label}</div>
        <Icon className={cn("h-4 w-4 flex-none", t.icon)} aria-hidden />
      </div>
      <div className={cn("mt-1 text-2xl font-bold", t.value)}>
        {value.toLocaleString()}
        <span className="ml-0.5 text-sm font-normal text-stone-500">
          {unit}
        </span>
      </div>
    </Link>
  );
}
