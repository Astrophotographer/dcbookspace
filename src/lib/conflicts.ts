// 신청서 충돌(같은 호실 + 시간 겹침) 클러스터링 유틸.
// - 모든신청내역 페이지: pending/approved 행을 묶어서 시각적 그룹 색 부여
// - 결재 마지막 단계: 이번 대상과 겹치는 다른 활성 신청서 조회 (별도 함수)

import type { SupabaseClient } from "@supabase/supabase-js";

export type ConflictRow = {
  id: string;
  room_id: string;
  start_at: string;
  end_at: string;
  series_id: string | null;
};

export type ConflictGroups = {
  /** 충돌 클러스터에 속한 reservation.id → cluster_id */
  byReservation: Map<string, string>;
  /** children 이 클러스터에 속한 series_id → 첫 매칭된 cluster_id */
  bySeries: Map<string, string>;
  /** cluster_id 등장 순서 (색 인덱스 매핑용) */
  clusterOrder: string[];
};

// === Disjoint-Set Union (Union-Find) ===
function makeDSU() {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const ensure = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  return { find, union, ensure };
}

/**
 * 활성 reservations(pending/approved, 시리즈 자식 포함)를 받아
 * 같은 호실+시간 겹침 페어를 union-find 로 묶고
 * 충돌 클러스터(2개 이상 묶인 그룹)만 결과로 돌려준다.
 */
export function computeConflictGroups(rows: ConflictRow[]): ConflictGroups {
  const dsu = makeDSU();
  for (const r of rows) dsu.ensure(r.id);

  // 호실별 버킷팅
  const byRoom = new Map<string, ConflictRow[]>();
  for (const r of rows) {
    const arr = byRoom.get(r.room_id) ?? [];
    arr.push(r);
    byRoom.set(r.room_id, arr);
  }

  // 호실 내에서 페어 비교 (Date.parse 로 오프셋 무관 비교)
  for (const list of byRoom.values()) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const aStart = Date.parse(a.start_at);
      const aEnd = Date.parse(a.end_at);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const bStart = Date.parse(b.start_at);
        const bEnd = Date.parse(b.end_at);
        if (aStart < bEnd && bStart < aEnd) {
          dsu.union(a.id, b.id);
        }
      }
    }
  }

  // root → 행 모음. 단일 행 그룹은 충돌 아님 (제외)
  const groupedByRoot = new Map<string, ConflictRow[]>();
  for (const r of rows) {
    const root = dsu.find(r.id);
    const arr = groupedByRoot.get(root) ?? [];
    arr.push(r);
    groupedByRoot.set(root, arr);
  }

  const byReservation = new Map<string, string>();
  const bySeries = new Map<string, string>();
  const clusterOrder: string[] = [];

  for (const r of rows) {
    const root = dsu.find(r.id);
    const groupSize = groupedByRoot.get(root)?.length ?? 0;
    if (groupSize < 2) continue; // 단독 → 충돌 아님

    if (!clusterOrder.includes(root)) clusterOrder.push(root);
    byReservation.set(r.id, root);
    if (r.series_id && !bySeries.has(r.series_id)) {
      bySeries.set(r.series_id, root);
    }
  }

  return { byReservation, bySeries, clusterOrder };
}

// =====================================================
// 결재 시점 — 이 대상(reservation/series)과 충돌하는 다른 활성 신청서 조회
// =====================================================

export type ActiveConflictItem = {
  kind: "reservation" | "series";
  /** 취소 대상 id. kind=reservation 이면 reservation.id, series 면 series.id */
  id: string;
  ref_no: string | null;
  purpose: string;
  applicant: { name: string; phone: string | null } | null;
  dept: { name: string } | null;
  /** 'approved' 면 결재 완료 (확정), 'pending' 이면 결재 진행 중 */
  status: "pending" | "approved";
  /** 대표 시각 (시리즈는 충돌하는 첫 회차) */
  start_at: string;
  end_at: string;
};

type RawReservation = {
  id: string;
  ref_no: string | null;
  purpose: string;
  start_at: string;
  end_at: string;
  status: "pending" | "approved";
  series_id: string | null;
  applicant: { name: string; phone: string | null } | null;
  dept: { name: string } | null;
};

type RawSeries = {
  id: string;
  ref_no: string | null;
  purpose: string;
  status: "pending" | "approved";
  applicant: { name: string; phone: string | null } | null;
  dept: { name: string } | null;
};

const RESERVATION_SELECT =
  "id, ref_no, purpose, start_at, end_at, status, series_id, applicant:users!applicant_id(name, phone), dept:departments(name)";

/**
 * 결재 마지막 단계에서, 이 대상(reservation 또는 series)과 충돌하는
 * 다른 활성 신청서들을 찾는다. 같은 series 의 children 끼리는 충돌로 보지 않음.
 */
export async function findActiveConflictsFor(
  // SupabaseClient 의 정확한 타입 매개변수가 길어 any 로 받음 — 호출 측에서 createServiceClient 결과 그대로 넘김
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", "public", any>,
  target: { kind: "reservation" | "series"; id: string },
): Promise<ActiveConflictItem[]> {
  let targetRoomId: string;
  let targetWindows: { start: number; end: number }[] = [];
  let targetReservationIds = new Set<string>();
  let targetSeriesId: string | null = null;

  if (target.kind === "reservation") {
    const { data, error } = await supabase
      .from("reservations")
      .select("id, room_id, start_at, end_at, series_id")
      .eq("id", target.id)
      .single();
    if (error || !data) return [];
    targetRoomId = data.room_id;
    targetWindows = [
      { start: Date.parse(data.start_at), end: Date.parse(data.end_at) },
    ];
    targetReservationIds = new Set([data.id]);
    targetSeriesId = data.series_id;
  } else {
    const { data: series, error: e1 } = await supabase
      .from("reservation_series")
      .select("id, room_id, reservations(id, start_at, end_at)")
      .eq("id", target.id)
      .single();
    if (e1 || !series) return [];
    targetRoomId = series.room_id;
    const children = (series.reservations ?? []) as {
      id: string;
      start_at: string;
      end_at: string;
    }[];
    if (children.length === 0) return [];
    targetWindows = children.map((c) => ({
      start: Date.parse(c.start_at),
      end: Date.parse(c.end_at),
    }));
    targetReservationIds = new Set(children.map((c) => c.id));
    targetSeriesId = series.id;
  }

  if (targetWindows.length === 0) return [];

  const minStart = Math.min(...targetWindows.map((w) => w.start));
  const maxEnd = Math.max(...targetWindows.map((w) => w.end));
  const minStartIso = new Date(minStart).toISOString();
  const maxEndIso = new Date(maxEnd).toISOString();

  const { data: candidates } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("room_id", targetRoomId)
    .in("status", ["pending", "approved"])
    .lt("start_at", maxEndIso)
    .gt("end_at", minStartIso);

  const cands = (candidates ?? []) as unknown as RawReservation[];

  const overlapping = cands.filter((r) => {
    if (targetReservationIds.has(r.id)) return false;
    if (targetSeriesId && r.series_id === targetSeriesId) return false;
    const rs = Date.parse(r.start_at);
    const re = Date.parse(r.end_at);
    return targetWindows.some((w) => rs < w.end && w.start < re);
  });

  const seenSeries = new Set<string>();
  const result: ActiveConflictItem[] = [];

  // 충돌 후보 중 series_id 가 있는 것들의 series 정보 일괄 조회
  const conflictingSeriesIds = Array.from(
    new Set(
      overlapping
        .map((r) => r.series_id)
        .filter((v): v is string => v != null),
    ),
  );
  let seriesById = new Map<string, RawSeries>();
  if (conflictingSeriesIds.length > 0) {
    const { data: sData } = await supabase
      .from("reservation_series")
      .select(
        "id, ref_no, purpose, status, applicant:users!applicant_id(name, phone), dept:departments(name)",
      )
      .in("id", conflictingSeriesIds);
    const arr = (sData ?? []) as unknown as RawSeries[];
    seriesById = new Map(arr.map((s) => [s.id, s]));
  }

  for (const r of overlapping) {
    if (r.series_id) {
      if (seenSeries.has(r.series_id)) continue;
      seenSeries.add(r.series_id);
      const s = seriesById.get(r.series_id);
      if (!s) continue;
      result.push({
        kind: "series",
        id: s.id,
        ref_no: s.ref_no,
        purpose: s.purpose,
        applicant: s.applicant,
        dept: s.dept,
        status: s.status,
        start_at: r.start_at,
        end_at: r.end_at,
      });
    } else {
      result.push({
        kind: "reservation",
        id: r.id,
        ref_no: r.ref_no,
        purpose: r.purpose,
        applicant: r.applicant,
        dept: r.dept,
        status: r.status,
        start_at: r.start_at,
        end_at: r.end_at,
      });
    }
  }

  return result;
}
