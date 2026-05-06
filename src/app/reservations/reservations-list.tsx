"use client";

import { ReservationsTable } from "@/components/reservations-table";
import type { ReservationDetail } from "@/lib/repo";

type Props = {
  reservations: ReservationDetail[];
};

export function ReservationsList({ reservations }: Props) {
  return (
    <ReservationsTable
      reservations={reservations}
      rowLink={(r) => ({ href: `/reservations/${r.id}` })}
    />
  );
}
