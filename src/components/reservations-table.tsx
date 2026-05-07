"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { ApprovalTracker } from "@/components/approval-tracker";
import { ReservationBadge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
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

const ROLE_ORDER: Record<UserRole, number> = {
  applicant: 0,
  dept_head: 1,
  elder: 2,
  manager: 3,
  senior_pastor: 4,
  admin: 5,
};
const NO_ROLE = 999;

const PAGE_SIZES = [10, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

// 검색어/필드 비교용 정규화: 대소문자 무시 + 공백·하이픈·#·_ 제거
// "25-0042", "250042", "#250042", "0042" 가 모두 같은 키로 매칭되도록.
function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[\s\-#_]/g, "");
}

function currentApproverRole(e: TableEntry): UserRole | null {
  const d = e.data;
  if (d.status !== "pending") return null;
  const step = d.route.steps.find((s) => s.order === d.current_step);
  return step?.role ?? null;
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
      const ar = currentApproverRole(a);
      const br = currentApproverRole(b);
      const ao = ar ? ROLE_ORDER[ar] : NO_ROLE;
      const bo = br ? ROLE_ORDER[br] : NO_ROLE;
      return ao - bo;
    }
  }
}

export function ReservationsTable({
  entries,
  rowLink,
  extraColumn,
  emptyMessage = "아직 작성된 신청서가 없습니다.",
}: Props) {
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [query, setQuery] = useState("");

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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const start = safePage * pageSize;
  const end = start + pageSize;
  const pageItems = filtered.slice(start, end);
  const isSearching = query.trim().length > 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setCurrentPage(0);
  };

  const changePageSize = (s: PageSize) => {
    setPageSize(s);
    setCurrentPage(0);
  };

  const colSpan = 7 + (extraColumn ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-stone-700">
          보기
          <select
            value={pageSize}
            onChange={(e) =>
              changePageSize(Number(e.target.value) as PageSize)
            }
            aria-label="페이지당 표시 개수"
            className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}개
              </option>
            ))}
          </select>
        </label>

        <div className="relative ml-auto w-full sm:w-72">
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
              setCurrentPage(0);
            }}
            placeholder="신청번호 · 부서 · 신청자"
            aria-label="신청번호, 부서, 신청자 검색"
            className="h-9 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-9 text-sm placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCurrentPage(0);
              }}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-700">
            <tr>
              <SortTh field="ref_no" sortField={sortField} sortDir={sortDir} onSort={handleSort}>신청번호</SortTh>
              <SortTh field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort}>작성일</SortTh>
              <SortTh field="dept" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                부서<br/>신청자
              </SortTh>
              <SortTh field="room" sortField={sortField} sortDir={sortDir} onSort={handleSort}>장소</SortTh>
              <SortTh field="start_at" sortField={sortField} sortDir={sortDir} onSort={handleSort}>사용일시</SortTh>
              <SortTh field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort}>상태</SortTh>
              <SortTh field="approval" sortField={sortField} sortDir={sortDir} onSort={handleSort}>결재 라인</SortTh>
              {extraColumn && (
                <th className="px-3 py-2 text-left font-semibold text-stone-700">
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
                    <div className="flex items-center gap-1.5">
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
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
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
                      <div className="font-medium text-stone-900">
                        {data.dept?.name ?? "-"}
                      </div>
                      <div className="text-stone-500">
                        {data.applicant.name}
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
                            ~ {formatDateTime(entry.data.end_at)}
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
                      {data.print_status === "failed" && (
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-stone-600">
            총 {total}건 중 {start + 1}-{Math.min(end, total)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="이전 페이지"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[5rem] text-center text-sm font-medium text-stone-700">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={safePage >= totalPages - 1}
              aria-label="다음 페이지"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
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
    <th className="px-3 py-2 text-left font-semibold">
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
  return <td className="px-3 py-2 align-top">{children}</td>;
}
