import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/config";
import {
  Users,
  Building,
  Briefcase,
  Network,
  FileText,
  ShieldCheck,
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
        <h1 className="mb-6 text-2xl font-bold">관리</h1>
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
