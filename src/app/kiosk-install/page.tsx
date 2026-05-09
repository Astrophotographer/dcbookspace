import Link from "next/link";
import { ArrowRight, Maximize2, Smartphone, Apple, Download } from "lucide-react";

/**
 * 사무실 키오스크 단말에서 PWA 설치를 유도하는 안내 페이지.
 * 이 페이지에 진입한 시점의 manifest 가 manifest-kiosk 라 "홈 화면에 추가" 시
 * 키오스크 전용 앱으로 등록되고, 시작 URL 이 /apply?kiosk=1 로 잡힘.
 *
 * 일반 사이트 헤더/푸터 X — 단말 앞에 가서 한 번만 거치는 셋업 페이지.
 */
export default function KioskInstallPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-12">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
        <Maximize2 className="h-10 w-10" strokeWidth={1.8} />
      </div>

      <h1 className="mb-3 text-center text-3xl font-bold text-stone-900">
        키오스크 모드 설치
      </h1>
      <p className="mb-10 max-w-md text-center text-base leading-relaxed text-stone-600">
        사무실 단말에 이 페이지를 <strong>홈 화면에 추가</strong>하면
        앱 아이콘 누를 때 곧장 키오스크 신청 화면으로 진입합니다.
      </p>

      {/* OS별 설치 가이드 */}
      <div className="grid w-full gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Android</h2>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
            <li>Chrome 으로 이 페이지를 연 상태에서</li>
            <li>우측 상단 <strong>점 3개</strong> → <strong>홈 화면에 추가</strong></li>
            <li>이름은 <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">장소신청 키오스크</span> 그대로 두고 추가</li>
            <li>홈 화면 아이콘 누르면 <strong>풀스크린</strong>으로 신청 화면 시작</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Apple className="h-5 w-5 text-stone-700" />
            <h2 className="text-lg font-semibold">iPad / iPhone</h2>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
            <li>Safari 로 이 페이지를 연 상태에서</li>
            <li>하단 <strong>공유</strong> 버튼 (네모+화살표)</li>
            <li><strong>홈 화면에 추가</strong> 선택 → 추가</li>
            <li>홈 아이콘 누르면 키오스크 모드 진입 (iOS 는 standalone)</li>
          </ol>
        </div>
      </div>

      <div className="mt-8 w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="mb-1 font-semibold">설치 후 단말 권장 설정</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>화면 자동 잠금: 5분 이상 또는 <strong>안 함</strong></li>
          <li>볼륨 제거 / 키보드 숨김 (단말 키 잠금 또는 가이드 액세스)</li>
          <li>iPadOS — 설정 → 손쉬운 사용 → <strong>가이드 액세스</strong> 켜면 단일 앱 모드 락 가능</li>
          <li>Android — 설정 → 보안 → <strong>화면 고정 (앱 고정)</strong></li>
        </ul>
      </div>

      <Link
        href="/apply?kiosk=1"
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        설치 없이 미리보기
        <ArrowRight className="h-5 w-5" />
      </Link>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500">
        <Download className="h-3 w-3" />
        설치 안 하고 바로 키오스크 화면 볼 수 있음 — 단, 풀스크린 모드는
        설치 후에만 동작
      </p>
    </main>
  );
}
