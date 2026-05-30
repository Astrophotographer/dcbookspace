"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  X,
} from "lucide-react";
import { ApprovalTracker } from "@/components/approval-tracker";
import { ReservationBadge } from "@/components/ui/badge";
import { cn, formatDateTime, formatDuration, formatTime } from "@/lib/utils";
import { maskName } from "@/lib/privacy";
import type {
  ApprovalRoute,
  AppUser,
  Department,
  PrintStatus,
  ReservationStatus,
  TimeBlock,
  UserRole,
} from "@/lib/supabase/types";
import {
  displayStatus,
  type DisplayStatus,
} from "@/lib/reservation-status";
import type { ApprovalWithApprover, RoomWithFloor } from "@/lib/repo";
import { weekdayLabel } from "@/lib/recurrence";

/** 일회성과 시리즈를 한 테이블에서 함께 표시하기 위한 통합 행 모델. */
export type SeriesRowItem = {
  id: string;
  ref_no: string | null;
  created_at: string;
  applicant: AppUser;
  dept: Department | null;
  room: RoomWithFloor;
  weekday: number;
  start_date: string;
  end_date: string;
  time_blocks: TimeBlock[];
  occurrence_count: number;
  status: ReservationStatus;
  current_step: number;
  route: ApprovalRoute;
  approvals: ApprovalWithApprover[];
  print_status: PrintStatus;
  print_completed_count: number;
};

export type ReservationRowItem = {
  id: string;
  ref_no: string | null;
  created_at: string;
  applicant: AppUser;
  dept: Department | null;
  room: RoomWithFloor;
  start_at: string;
  end_at: string;
  status: ReservationStatus;
  current_step: number;
  route: ApprovalRoute;
  approvals: ApprovalWithApprover[];
  print_status: PrintStatus;
  print_completed_count: number;
};

export type TableEntry =
  | {
      kind: "reservation";
      data: ReservationRowItem;
      /** 충돌 그룹 인덱스. 충돌 없음이면 undefined. 같은 그룹 = 같은 색. */
      conflictGroupIndex?: number;
    }
  | {
      kind: "series";
      data: SeriesRowItem;
      conflictGroupIndex?: number;
    };

// 충돌 그룹 색 팔레트. 인덱스 % palette.length 로 사이클.
const CONFLICT_PALETTE = [
  { left: "border-l-amber-500", chip: "bg-amber-100 text-amber-800" },
  { left: "border-l-rose-500", chip: "bg-rose-100 text-rose-800" },
  { left: "border-l-violet-500", chip: "bg-violet-100 text-violet-800" },
  { left: "border-l-teal-500", chip: "bg-teal-100 text-teal-800" },
  { left: "border-l-indigo-500", chip: "bg-indigo-100 text-indigo-800" },
] as const;

type RowLink = {
  href: string;
  target?: "_blank" | "_self";
};

type Props = {
  entries: TableEntry[];
  rowLink: (entry: TableEntry) => RowLink;
  extraColumn?: {
    header: string;
    render: (entry: TableEntry) => ReactNode;
  };
  emptyMessage?: string;
  /** 관리자가 아닌 사용자에겐 신청자 이름을 "홍**" 형태로 마스킹 */
  isAdmin?: boolean;
  /** 사이트-와이드 프린트 토글. false 면 "프린트 문제" 배지 숨김 */
  printEnabled?: boolean;
};

type SortField =
  | "ref_no"
  | "created_at"
  | "dept"
  | "room"
  | "start_at"
  | "status"
  | "approval";

type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<DisplayStatus, number> = {
  draft: 0,
  submitted: 1,
  in_review: 2,
  confirmed: 3,
  rejected: 4,
  cancelled: 5,
};

// "결재 라인" 컬럼 정렬 키 (마지막으로 통과한 단계의 role 기준).
// 내림차순 정렬 시 사용자 의도가:
//   당회장까지 결재됨 → 관리장로까지 → 차장까지 → 부서장까지 → 결재대기
// 가 되도록 senior_pastor 가 가장 큰 값.
const ROLE_ORDER: Record<UserRole, number> = {
  applicant: 0,
  admin: 0,
  dept_head: 1,
  manager: 2,         // 차장
  elder: 3,           // 관리장로
  senior_pastor: 4,   // 당회장 (가장 위)
};
// 아무 단계도 통과 못한(결재 대기) 신청서는 제일 아래.
const NOT_APPROVED = -1;

const LOAD_CHUNK_SIZE = 10;

// 검색어/필드 비교용 정규화: 대소문자 무시 + 공백·하이픈·#·_ 제거
// "25-0042", "250042", "#250042", "0042" 가 모두 같은 키로 매칭되도록.
function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[\s\-#_]/g, "");
}

/** 마지막으로 통과(approved)한 결재 단계의 role. 통과한 단계 없으면 null. */
function lastApprovedRole(e: TableEntry): UserRole | null {
  const { approvals, route } = e.data;
  let maxStep = -1;
  let role: UserRole | null = null;
  for (const a of approvals) {
    if (a.status !== "approved") continue;
    if (a.step_order > maxStep) {
      maxStep = a.step_order;
      const step = route.steps.find((s) => s.order === a.step_order);
      role = step?.role ?? null;
    }
  }
  return role;
}

function roomLabel(e: TableEntry): string {
  const r = e.data.room;
  return `${r.floor.building.name} ${r.floor.label} ${r.name}`;
}

function sortStartAt(e: TableEntry): string {
  if (e.kind === "reservation") return e.data.start_at;
  // 시리즈: 첫 회차 시각으로 정렬 — start_date + 첫 시간대 시작
  const block = e.data.time_blocks[0];
  return `${e.data.start_date}T${block?.start ?? "00:00"}:00+09:00`;
}

function statusInputFor(e: TableEntry) {
  return { status: e.data.status, approvals: e.data.approvals };
}

function PrintCount({ count }: { count: number }) {
  if (!Number.isFinite(count) || count <= 0) {
    return (
      <span
        className="inline-flex min-w-8 justify-center rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-500 ring-1 ring-stone-200"
        title="아직 출력 완료 기록이 없습니다."
      >
        X
      </span>
    );
  }

  return (
    <span
      className="inline-flex min-w-8 justify-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold tabular-nums text-emerald-800 ring-1 ring-emerald-200"
      title={`${count}회 출력 완료`}
    >
      {count}
    </span>
  );
}

function compareField(a: TableEntry, b: TableEntry, field: SortField): number {
  switch (field) {
    case "ref_no":
      return (a.data.ref_no ?? "").localeCompare(b.data.ref_no ?? "", "ko");
    case "created_at":
      return a.data.created_at.localeCompare(b.data.created_at);
    case "dept":
      return (a.data.dept?.name ?? "").localeCompare(
        b.data.dept?.name ?? "",
        "ko",
      );
    case "room":
      return roomLabel(a).localeCompare(roomLabel(b), "ko");
    case "start_at":
      return sortStartAt(a).localeCompare(sortStartAt(b));
    case "status":
      return (
        STATUS_ORDER[displayStatus(statusInputFor(a))] -
        STATUS_ORDER[displayStatus(statusInputFor(b))]
      );
    case "approval": {
      const ar = lastApprovedRole(a);
      const br = lastApprovedRole(b);
      const ao = ar ? ROLE_ORDER[ar] : NOT_APPROVED;
      const bo = br ? ROLE_ORDER[br] : NOT_APPROVED;
      return ao - bo;
    }
  }
}

export function ReservationsTable({
  entries,
  rowLink,
  extraColumn,
  emptyMessage = "아직 작성된 신청서가 없습니다.",
  isAdmin,
  printEnabled = true,
}: Props) {
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleCount, setVisibleCount] = useState(LOAD_CHUNK_SIZE);
  const [query, setQuery] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const sortedAll = useMemo(() => {
    return [...entries].sort((a, b) => {
      const cmp = compareField(a, b, sortField);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortField, sortDir]);

  // 신청번호 / 부서명 / 신청자명 통합 검색. 빈 문자열이면 통과.
  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return sortedAll;
    return sortedAll.filter((e) => {
      const refNo = normalizeForSearch(e.data.ref_no ?? "");
      const dept = normalizeForSearch(e.data.dept?.name ?? "");
      const name = normalizeForSearch(e.data.applicant.name ?? "");
      return refNo.includes(q) || dept.includes(q) || name.includes(q);
    });
  }, [sortedAll, query]);

  const total = filtered.length;
  const pageItems = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < total;
  const isSearching = query.trim().length > 0;

  useEffect(() => {
    if (!hasMore) return;
    if (typeof IntersectionObserver === "undefined") return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (observedEntries) => {
        if (observedEntries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) =>
            Math.min(count + LOAD_CHUNK_SIZE, total),
          );
        }
      },
      { rootMargin: "360px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, total]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setVisibleCount(LOAD_CHUNK_SIZE);
  };

  const colSpan = 8 + (extraColumn ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="relative ml-auto w-full sm:w-80">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          >
            <Search className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(LOAD_CHUNK_SIZE);
            }}
            placeholder="신청번호 · 부서 · 신청자"
            aria-label="신청번호, 부서, 신청자 검색"
            className="h-10 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-9 text-sm placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setVisibleCount(LOAD_CHUNK_SIZE);
              }}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm md:hidden">
        <table className="min-w-[66rem] table-fixed text-base">
          {/* 모바일 컬럼 순서: 부서·작성자 / 장소 / 사용일시 / 상태 / 신청번호 / 결재 라인 / 작성일 / 서류출력 / (extra) */}
          <colgroup>
            <col className="w-[7.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[12.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[9.5rem]" />
            <col className="w-[6rem]" />
            {extraColumn && <col className="w-[7rem]" />}
          </colgroup>
          <thead className="bg-stone-50 text-stone-700">
            <tr>
              <SortTh field="dept" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                부서<br/>작성자
              </SortTh>
              <SortTh field="room" sortField={sortField} sortDir={sortDir} onSort={handleSort}>장소</SortTh>
              <SortTh field="start_at" sortField={sortField} sortDir={sortDir} onSort={handleSort}>사용일시</SortTh>
              <SortTh field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort}>상태</SortTh>
              <SortTh field="ref_no" sortField={sortField} sortDir={sortDir} onSort={handleSort}>신청번호</SortTh>
              <SortTh field="approval" sortField={sortField} sortDir={sortDir} onSort={handleSort}>결재 라인</SortTh>
              <SortTh field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort}>작성일</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-stone-700">
                서류출력
              </th>
              {extraColumn && (
                <th className="px-2 py-2 text-left font-semibold text-stone-700">
                  {extraColumn.header}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((entry) => {
              const link = rowLink(entry);
              const linkProps = {
                href: link.href,
                target: link.target,
                rel:
                  link.target === "_blank"
                    ? "noopener noreferrer"
                    : undefined,
              };
              const data = entry.data;
              const isSeries = entry.kind === "series";
              const cgi = entry.conflictGroupIndex;
              const palette =
                cgi != null
                  ? CONFLICT_PALETTE[cgi % CONFLICT_PALETTE.length]
                  : null;
              return (
                <tr
                  key={`${entry.kind}-${data.id}`}
                  className={cn(
                    "cursor-pointer border-t border-stone-100 hover:bg-stone-50",
                    palette && `border-l-4 ${palette.left}`,
                  )}
                >
                  <Td>
                    <Link {...linkProps} className="block">
                      <div className="font-medium text-stone-900">
                        {data.dept?.name ?? "-"}
                      </div>
                      <div className="text-stone-500">
                        {isAdmin
                          ? data.applicant.name
                          : maskName(data.applicant.name)}
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      <div className="text-stone-700">
                        {data.room.floor.building.name}{" "}
                        {data.room.floor.label}
                      </div>
                      <div className="font-medium text-stone-900">
                        {data.room.name}
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      {entry.kind === "reservation" ? (
                        <>
                          <div className="text-stone-700">
                            {formatDateTime(entry.data.start_at)}
                          </div>
                          <div className="text-xs text-stone-500">
                            {entry.data.start_at.slice(0, 10) ===
                            entry.data.end_at.slice(0, 10) ? (
                              <>
                                ~ {formatTime(entry.data.end_at)} (
                                {formatDuration(
                                  entry.data.start_at,
                                  entry.data.end_at,
                                )}
                                )
                              </>
                            ) : (
                              <>~ {formatDateTime(entry.data.end_at)}</>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-stone-700">
                            매주 {weekdayLabel(entry.data.weekday)}{" "}
                            {entry.data.time_blocks
                              .map((b) => `${b.start}–${b.end}`)
                              .join(" / ")}
                          </div>
                          <div className="text-xs text-stone-500">
                            {entry.data.start_date} ~{" "}
                            {entry.data.end_date} ·{" "}
                            {entry.data.occurrence_count}회
                          </div>
                        </>
                      )}
                    </Link>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <ReservationBadge reservation={statusInputFor(entry)} />
                      {printEnabled && data.print_status === "failed" && (
                        <span
                          className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200"
                          title="사무실 프린터 연결에 문제가 있어 인쇄가 실패했어요. 신청서 상세에서 다시 요청 가능합니다."
                        >
                          ⚠ 프린트문제
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        {...linkProps}
                        className={cn(
                          "font-mono hover:underline",
                          isSeries
                            ? "text-emerald-700"
                            : "text-brand-700",
                        )}
                      >
                        #{data.ref_no ?? data.id.slice(0, 8)}
                      </Link>
                      {palette && cgi != null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                            palette.chip,
                          )}
                          title={`같은 호실·시간대로 다른 신청서와 겹쳐 있어요 (충돌 그룹 ${cgi + 1})`}
                          aria-label={`충돌 그룹 ${cgi + 1}`}
                        >
                          중복 {cgi + 1}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <ApprovalTracker
                      route={data.route}
                      approvals={data.approvals}
                      currentStep={data.current_step}
                      compact
                    />
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      {formatDateTime(data.created_at)}
                    </Link>
                  </Td>
                  <Td>
                    <PrintCount count={data.print_completed_count} />
                  </Td>
                  {extraColumn && <Td>{extraColumn.render(entry)}</Td>}
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="p-12 text-center text-stone-500"
                >
                  {isSearching
                    ? `"${query.trim()}" 검색 결과가 없습니다.`
                    : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
        {/* table-fixed + colgroup 으로 컬럼 폭 고정 — 정렬·페이지 전환 시 행
            내용이 달라져도 너비가 들썩이지 않게. 결재 라인은 가장 가변적이라
            폭 미지정으로 두고 나머지 fixed 폭의 잔여 공간을 가져가게 함. */}
        <table className="w-full table-fixed text-base">
          {/* 컬럼 순서: 신청번호 / 작성일 / 사용일시 / 장소 / 부서·신청자 / 상태 / 결재 라인 / 서류출력 / (extra) */}
          <colgroup>
            <col className="w-[7.5rem]" />
            <col className="w-[9.5rem]" />
            <col className="w-[12.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[6rem]" />
            {extraColumn && <col className="w-[7rem]" />}
          </colgroup>
          <thead className="bg-stone-50 text-stone-700">
            <tr>
              <SortTh field="ref_no" sortField={sortField} sortDir={sortDir} onSort={handleSort}>신청번호</SortTh>
              <SortTh field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort}>작성일</SortTh>
              <SortTh field="start_at" sortField={sortField} sortDir={sortDir} onSort={handleSort}>사용일시</SortTh>
              <SortTh field="room" sortField={sortField} sortDir={sortDir} onSort={handleSort}>장소</SortTh>
              <SortTh field="dept" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                부서<br/>신청자
              </SortTh>
              <SortTh field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort}>상태</SortTh>
              <SortTh field="approval" sortField={sortField} sortDir={sortDir} onSort={handleSort}>결재 라인</SortTh>
              <th className="px-2 py-2 text-left font-semibold text-stone-700">
                서류출력
              </th>
              {extraColumn && (
                <th className="px-2 py-2 text-left font-semibold text-stone-700">
                  {extraColumn.header}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((entry) => {
              const link = rowLink(entry);
              const linkProps = {
                href: link.href,
                target: link.target,
                rel:
                  link.target === "_blank"
                    ? "noopener noreferrer"
                    : undefined,
              };
              const data = entry.data;
              const isSeries = entry.kind === "series";
              const cgi = entry.conflictGroupIndex;
              const palette =
                cgi != null
                  ? CONFLICT_PALETTE[cgi % CONFLICT_PALETTE.length]
                  : null;
              return (
                <tr
                  key={`${entry.kind}-${data.id}`}
                  className={cn(
                    "cursor-pointer border-t border-stone-100 hover:bg-stone-50",
                    palette && `border-l-4 ${palette.left}`,
                  )}
                >
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        {...linkProps}
                        className={cn(
                          "font-mono hover:underline",
                          isSeries
                            ? "text-emerald-700"
                            : "text-brand-700",
                        )}
                      >
                        #{data.ref_no ?? data.id.slice(0, 8)}
                      </Link>
                      {palette && cgi != null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                            palette.chip,
                          )}
                          title={`같은 호실·시간대로 다른 신청서와 겹쳐 있어요 (충돌 그룹 ${cgi + 1})`}
                          aria-label={`충돌 그룹 ${cgi + 1}`}
                        >
                          중복 {cgi + 1}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      {formatDateTime(data.created_at)}
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      {entry.kind === "reservation" ? (
                        <>
                          <div className="text-stone-700">
                            {formatDateTime(entry.data.start_at)}
                          </div>
                          <div className="text-xs text-stone-500">
                            {entry.data.start_at.slice(0, 10) ===
                            entry.data.end_at.slice(0, 10) ? (
                              <>
                                ~ {formatTime(entry.data.end_at)} (
                                {formatDuration(
                                  entry.data.start_at,
                                  entry.data.end_at,
                                )}
                                )
                              </>
                            ) : (
                              <>~ {formatDateTime(entry.data.end_at)}</>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-stone-700">
                            매주 {weekdayLabel(entry.data.weekday)}{" "}
                            {entry.data.time_blocks
                              .map((b) => `${b.start}–${b.end}`)
                              .join(" / ")}
                          </div>
                          <div className="text-xs text-stone-500">
                            {entry.data.start_date} ~{" "}
                            {entry.data.end_date} ·{" "}
                            {entry.data.occurrence_count}회
                          </div>
                        </>
                      )}
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      <div className="text-stone-700">
                        {data.room.floor.building.name}{" "}
                        {data.room.floor.label}
                      </div>
                      <div className="font-medium text-stone-900">
                        {data.room.name}
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      <div className="font-medium text-stone-900">
                        {data.dept?.name ?? "-"}
                      </div>
                      <div className="text-stone-500">
                        {isAdmin
                          ? data.applicant.name
                          : maskName(data.applicant.name)}
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <ReservationBadge reservation={statusInputFor(entry)} />
                      {printEnabled && data.print_status === "failed" && (
                        <span
                          className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200"
                          title="사무실 프린터 연결에 문제가 있어 인쇄가 실패했어요. 신청서 상세에서 다시 요청 가능합니다."
                        >
                          ⚠ 프린트문제
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <ApprovalTracker
                      route={data.route}
                      approvals={data.approvals}
                      currentStep={data.current_step}
                      compact
                    />
                  </Td>
                  <Td>
                    <PrintCount count={data.print_completed_count} />
                  </Td>
                  {extraColumn && <Td>{extraColumn.render(entry)}</Td>}
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="p-12 text-center text-stone-500"
                >
                  {isSearching
                    ? `"${query.trim()}" 검색 결과가 없습니다.`
                    : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-center shadow-sm">
          <div className="text-sm text-stone-600">
            총 {total}건 중 {Math.min(visibleCount, total)}건 표시
          </div>
          {hasMore ? (
            <button
              type="button"
              onClick={() =>
                setVisibleCount((count) =>
                  Math.min(count + LOAD_CHUNK_SIZE, total),
                )
              }
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              더 불러오기
            </button>
          ) : (
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600">
              모두 표시됨
            </span>
          )}
        </div>
      )}
      {hasMore && <div ref={loadMoreRef} className="h-1" aria-hidden />}
    </div>
  );
}

function SortTh({
  field,
  sortField,
  sortDir,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  children: ReactNode;
}) {
  const active = sortField === field;
  return (
    <th className="px-2 py-2 text-left font-semibold">
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`${typeof children === "string" ? children : "이 컬럼"} 기준 정렬${
          active ? ` (현재 ${sortDir === "asc" ? "오름차순" : "내림차순"})` : ""
        }`}
        className={cn(
          "flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
          active ? "text-stone-900" : "text-stone-700 hover:text-stone-900",
        )}
      >
        <span>{children}</span>
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-4 w-4 text-brand-600" />
          ) : (
            <ArrowDown className="h-4 w-4 text-brand-600" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-25" />
        )}
      </button>
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-2 py-2 align-top">{children}</td>;
}
