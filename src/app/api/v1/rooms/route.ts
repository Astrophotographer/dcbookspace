import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { unauthorized, verifyApiToken } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type RoomRow = {
  id: string;
  name: string;
  capacity: number | null;
  floor: {
    id: string;
    label: string;
    building: { id: string; name: string };
  };
};

/**
 * GET /api/v1/rooms
 *
 * 외부 호출자에게 호실 마스터를 내려준다 — 다른 엔드포인트의 room_id 를
 * 식별할 때 가장 먼저 부르는 디렉토리. 정렬: building/floor/room display_order.
 */
export async function GET(req: Request) {
  if (!verifyApiToken(req)) return unauthorized();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .select(
      "id, name, capacity, floor:floors!inner(id, label, building:buildings!inner(id, name))",
    )
    .order("display_order");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as RoomRow[];
  return NextResponse.json({
    rooms: rows.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      building: { id: r.floor.building.id, name: r.floor.building.name },
      floor: { id: r.floor.id, label: r.floor.label },
    })),
  });
}
