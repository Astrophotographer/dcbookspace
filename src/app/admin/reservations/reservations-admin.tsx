"use client";

import {
  ReservationsTable,
  type TableEntry,
} from "@/components/reservations-table";

type Props = {
  entries: TableEntry[];
  printEnabled?: boolean;
};

export function ReservationsAdmin({ entries, printEnabled }: Props) {
  return (
    <ReservationsTable
      entries={entries}
      printEnabled={printEnabled}
      rowLink={(e) => ({
        // 시리즈는 별도 admin 상세 페이지가 없어 공개 시리즈 페이지로
        href:
          e.kind === "series"
            ? `/series/${e.data.id}`
            : `/admin/reservations/${e.data.id}`,
      })}
    />
  );
}
