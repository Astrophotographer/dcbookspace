"use client";

import {
  ReservationsTable,
  type TableEntry,
} from "@/components/reservations-table";

type Props = {
  entries: TableEntry[];
  /** 관리자면 일회성 신청 클릭 시 /admin/reservations/[id] 로 직행. */
  isAdmin?: boolean;
};

export function ReservationsList({ entries, isAdmin }: Props) {
  return (
    <ReservationsTable
      entries={entries}
      rowLink={(e) => ({
        href:
          e.kind === "series"
            ? `/series/${e.data.id}`
            : isAdmin
              ? `/admin/reservations/${e.data.id}`
              : `/reservations/${e.data.id}`,
      })}
    />
  );
}
