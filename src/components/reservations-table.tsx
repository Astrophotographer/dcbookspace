"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ApprovalTracker } from "@/components/approval-tracker";
import { ReservationBadge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/types";
import {
  displayStatus,
  type DisplayStatus,
} from "@/lib/reservation-status";
import type { ReservationDetail } from "@/lib/repo";

type RowLink = {
  href: string;
  target?: "_blank" | "_self";
};

type Props = {
  reservations: ReservationDetail[];
  rowLink: (r: ReservationDetail) => RowLink;
  /** 우측에 추가 컬럼 렌더 — 공개 페이지의 본인용 [수정][삭제] 버튼 등 */
  extraColumn?: {
    header: string;
    render: (r: ReservationDetail) => ReactNode;
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

function currentApproverRole(r: ReservationDetail): UserRole | null {
  if (r.status !== "pending") return null;
  const step = r.route.steps.find((s) => s.order === r.current_step);
  return step?.role ?? null;
}

function roomLabel(r: ReservationDetail): string {
  return `${r.room.floor.building.name} ${r.room.floor.label} ${r.room.name}`;
}

function compareField(
  a: ReservationDetail,
  b: ReservationDetail,
  field: SortField,
): number {
  switch (field) {
    case "ref_no":
      return (a.ref_no ?? "").localeCompare(b.ref_no ?? "", "ko");
    case "created_at":
      return a.created_at.localeCompare(b.created_at);
    case "dept":
      return (a.dept?.name ?? "").localeCompare(b.dept?.name ?? "", "ko");
    case "room":
      return roomLabel(a).localeCompare(roomLabel(b), "ko");
    case "start_at":
      return a.start_at.localeCompare(b.start_at);
    case "status":
      return STATUS_ORDER[displayStatus(a)] - STATUS_ORDER[displayStatus(b)];
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
  reservations,
  rowLink,
  extraColumn,
  emptyMessage = "아직 작성된 신청서가 없습니다.",
}: Props) {
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(0);

  const sortedAll = useMemo(() => {
    return [...reservations].sort((a, b) => {
      const cmp = compareField(a, b, sortField);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [reservations, sortField, sortDir]);

  const total = sortedAll.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const start = safePage * pageSize;
  const end = start + pageSize;
  const pageItems = sortedAll.slice(start, end);

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
        <span className="text-xs text-stone-500">
          컬럼 제목을 클릭하면 정렬돼요. 다시 누르면 방향이 바뀝니다.
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-700">
            <tr>
              <SortTh
                field="ref_no"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                신청번호
              </SortTh>
              <SortTh
                field="created_at"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                작성일
              </SortTh>
              <SortTh
                field="dept"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                부서 / 신청자
              </SortTh>
              <SortTh
                field="room"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                장소
              </SortTh>
              <SortTh
                field="start_at"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                사용일시
              </SortTh>
              <SortTh
                field="status"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                상태
              </SortTh>
              <SortTh
                field="approval"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                결재 라인
              </SortTh>
              {extraColumn && (
                <th className="px-3 py-2 text-left font-semibold text-stone-700">
                  {extraColumn.header}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => {
              const link = rowLink(r);
              const linkProps = {
                href: link.href,
                target: link.target,
                rel: link.target === "_blank" ? "noopener noreferrer" : undefined,
              };
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
                >
                  <Td>
                    <Link
                      {...linkProps}
                      className="font-mono text-brand-700 hover:underline"
                    >
                      #{r.ref_no ?? r.id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      {formatDateTime(r.created_at)}
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      <span className="font-medium">
                        {r.dept?.name ?? "-"}
                      </span>
                      <span className="ml-2 text-stone-500">
                        {r.applicant.name}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      {r.room.floor.building.name} {r.room.floor.label}{" "}
                      {r.room.name}
                    </Link>
                  </Td>
                  <Td>
                    <Link {...linkProps} className="block">
                      <div className="text-stone-700">
                        {formatDateTime(r.start_at)}
                      </div>
                      <div className="text-xs text-stone-500">
                        ~ {formatDateTime(r.end_at)}
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <ReservationBadge reservation={r} />
                  </Td>
                  <Td>
                    <ApprovalTracker
                      route={r.route}
                      approvals={r.approvals}
                      currentStep={r.current_step}
                      compact
                    />
                  </Td>
                  {extraColumn && <Td>{extraColumn.render(r)}</Td>}
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="p-12 text-center text-stone-500"
                >
                  {emptyMessage}
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
