"use client";

import {
  ReservationsTable,
  type TableEntry,
} from "@/components/reservations-table";

type Props = {
  entries: TableEntry[];
};

export function ReservationsList({ entries }: Props) {
  return (
    <ReservationsTable
      entries={entries}
      rowLink={(e) => ({
        href:
          e.kind === "series"
            ? `/series/${e.data.id}`
            : `/reservations/${e.data.id}`,
      })}
    />
  );
}
