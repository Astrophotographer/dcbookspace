import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import { adminLogout } from "@/lib/admin-actions";
import {
  Users,
  Building,
  Briefcase,
  Network,
  FileText,
  LogOut,
  QrCode,
  ShieldCheck,
  CalendarClock,
} from "lucide-react";

const TILES = [
  {
    href: "/admin/admins",
    label: "관리자정보",
    desc: "관리자 추가·삭제, 마스터 PIN 발급",
    Icon: ShieldCheck,
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
    label: "고정 행사",
    desc: "주일 예배 등 매주 정기 일정 관리",
    Icon: CalendarClock,
  },
  {
    href: "/admin/apply-qr",
    label: "신청 QR",
    desc: "외부 게시용 QR 코드 — 휴대폰으로 스캔 시 신청서 바로 열림",
    Icon: QrCode,
  },
];

export default function AdminHome() {
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              title="관리자 모드를 끕니다"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              로그아웃
            </button>
          </form>
        </div>
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
