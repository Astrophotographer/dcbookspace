"use client";

import {
  ReservationsTable,
  type TableEntry,
} from "@/components/reservations-table";

type Props = {
  entries: TableEntry[];
  /** 관리자면 일회성 신청 클릭 시 /admin/reservations/[id] 로 직행. */
  isAdmin?: boolean;
  printEnabled?: boolean;
  emptyMessage?: string;
};

export function ReservationsList({
  entries,
  isAdmin,
  printEnabled,
  emptyMessage,
}: Props) {
  return (
    <ReservationsTable
      entries={entries}
      isAdmin={isAdmin}
      printEnabled={printEnabled}
      emptyMessage={emptyMessage}
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
