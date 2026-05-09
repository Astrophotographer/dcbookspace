"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Plus,
  Printer,
  X,
} from "lucide-react";
import type {
  Building,
  Department,
  Floor,
  Room,
  TimeBlock,
} from "@/lib/supabase/types";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConflictModal } from "@/components/ui/conflict-modal";
import { setMe } from "@/lib/me";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  computeWeeklyOccurrences,
  describeSeries,
  validateTimeBlocks,
  weekdayLabel,
} from "@/lib/recurrence";
import {
  findRoomConflicts,
  findSeriesConflicts,
  submitApplication,
  submitSeriesApplication,
  updateApplication,
  updateSeries,
  type RoomConflictResult,
  type SeriesConflictResult,
} from "./actions";
import { AvailabilityPreview } from "./availability-preview";

export type ApplyFormDefaults = {
  applicant_name: string;
  applicant_phone: string;
  dept_id: string;
  building_id: string;
  floor_id: string;
  room_id: string;
  date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  attendee_count: number;
  is_external: boolean;
  notes: string;
  /** 정기 신청 모드. 시리즈 수정 페이지에서 미리 채워서 들어옴 */
  recurring?: boolean;
  /** recurring=true 일 때 사용할 시간대 배열 */
  time_blocks?: TimeBlock[];
};

type EditTarget = {
  /** 'reservation' = 일회성, 'series' = 시리즈 */
  kind: "reservation" | "series";
  id: string;
  ownerName: string;
  ownerPhone: string;
};

type Props = {
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  departments: Department[];
  defaults?: ApplyFormDefaults;
  editTarget?: EditTarget;
};

/** 충돌 모달이 들고 있는 데이터 — 일회성/시리즈 케이스 분기 */
type ConflictModalState =
  | { kind: "single"; result: RoomConflictResult; fd: FormData }
  | { kind: "series"; result: SeriesConflictResult; fd: FormData };

const MAX_TIME_BLOCKS = 4;

// YYYY-MM-DD. 8자리 숫자 입력 시 dash + MM/DD 범위 자동 보정.
//   MM > 12  → 12
//   MM = 00  → 01
//   DD > max → 해당 월 최대일수 (윤년 반영)
//   DD = 00  → 01
function maxDayOfMonth(year: number, month: number): number {
  if ([1, 3, 5, 7, 8, 10, 12].includes(month)) return 31;
  if ([4, 6, 9, 11].includes(month)) return 30;
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return 31;
}

/**
 * 시프트 레지스터: 완성된 YYYY-MM-DD 상태에서 숫자 한 자 누르면 일(DD) 자리만 시프트.
 *   2026-05-01 + "1" → 2026-05-11
 *   2026-05-11 + "2" → 2026-05-12
 *   2026-05-12 + "5" → 2026-05-25
 * 일이 월의 최대일수를 넘으면 자동으로 max 로 클램프 (윤년 반영).
 * 형식이 완성되지 않은 상태(연·월 입력 중) 에선 호출자가 normal flow 로 갈 것.
 */
function shiftDayDigit(current: string, digit: string): string | null {
  const m = current.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !/^\d$/.test(digit)) return null;
  const [, yyyy, mm, dd] = m;
  let n = parseInt(dd[1] + digit, 10);
  if (n === 0) n = 1;
  const y = parseInt(yyyy, 10);
  const mo = parseInt(mm, 10);
  if (mo < 1 || mo > 12) return null;
  const max = maxDayOfMonth(y, mo);
  if (n > max) n = max;
  return `${yyyy}-${mm}-${String(n).padStart(2, "0")}`;
}

/**
 * YYYY-MM-DD → "M월 N째 주 X요일" 한국어 라벨.
 * 시작 날짜 hint 에 "지금 입력한 날짜가 그 달 몇째 주 무슨 요일인지" 안내.
 * 형식 안 맞으면 "YYYY-MM-DD" 안내 그대로.
 */
function describeDateInMonth(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "YYYY-MM-DD";
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return "YYYY-MM-DD";
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const dow = d.getDay(); // 0=일 ... 6=토
  // 일자 1~7 = 첫째, 8~14 = 둘째, 15~21 = 셋째, 22~28 = 넷째, 29+ = 다섯째
  const nth = Math.ceil(day / 7);
  const ordinals = ["첫째", "둘째", "셋째", "넷째", "다섯째"];
  const ord = ordinals[nth - 1] ?? `${nth}째`;
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  return `${month}월 ${ord} 주 ${dayLabels[dow]}요일`;
}

/**
 * 날짜 입력 우측에 겹쳐 두는 작은 달력 픽커.
 * - 텍스트 입력 위에 calendar 아이콘을 절대 배치
 * - 같은 자리에 투명한 `<input type="date">` 를 둬서 클릭하면 네이티브 picker 가 뜸
 * - 사용자가 picker 에서 날짜 고르면 onPick 으로 부모 텍스트 입력 갱신
 *
 * 텍스트 입력의 우측 padding(pr-12) 와 함께 써야 아이콘과 글자가 겹치지 않음.
 */
function DatePickerOverlay({
  value,
  onPick,
}: {
  value: string;
  onPick: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const validIso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  return (
    <div className="pointer-events-none absolute inset-y-0 right-1.5 flex w-9 items-center justify-center text-stone-500">
      <CalendarDays className="h-5 w-5" aria-hidden />
      <input
        ref={inputRef}
        type="date"
        value={validIso}
        onChange={(e) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
            onPick(e.target.value);
          }
        }}
        onClick={() => {
          // 일부 브라우저에서 click 만으로는 picker 가 안 떠서 explicit showPicker 호출.
          // 미지원 환경(Safari iOS 일부 등)에선 try/catch 로 graceful skip.
          const inp = inputRef.current;
          if (inp && typeof inp.showPicker === "function") {
            try {
              inp.showPicker();
            } catch {
              /* 무시 */
            }
          }
        }}
        aria-label="달력으로 날짜 선택"
        className="pointer-events-auto absolute inset-0 cursor-pointer opacity-0"
        tabIndex={-1}
      />
    </div>
  );
}

/**
 * "HH:MM" 에 1시간을 더한 결과 (24:00 이후엔 23:59 로 cap).
 * 같은날에서 종료 시간이 시작보다 이상해질 때 자동 보정용.
 */
function timePlusOneHour(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  const total = Number(m[1]) * 60 + Number(m[2]) + 60;
  if (total >= 24 * 60) return "23:59";
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;

  const yyyy = d.slice(0, 4);
  let mm = d.slice(4, 6);

  if (mm.length === 2) {
    const m = parseInt(mm, 10);
    if (m > 12) mm = "12";
    else if (m === 0) mm = "01";
  }

  if (d.length <= 6) return `${yyyy}-${mm}`;

  let dd = d.slice(6, 8);
  if (dd.length === 2) {
    const m = mm.length === 2 ? parseInt(mm, 10) : 0;
    const y = parseInt(yyyy, 10);
    const max = m === 0 ? 31 : maxDayOfMonth(y, m);
    const day = parseInt(dd, 10);
    if (day > max) dd = String(max).padStart(2, "0");
    else if (day === 0) dd = "01";
  }

  return `${yyyy}-${mm}-${dd}`;
}

export function ApplyForm({
  buildings,
  floors,
  rooms,
  departments,
  defaults,
  editTarget,
}: Props) {
  const router = useRouter();
  // 키오스크 모드 진입 여부 — 신청 성공 redirect URL 에 ?kiosk=1 자동 보존
  const searchParams = useSearchParams();
  const isKiosk = searchParams.get("kiosk") === "1";
  const kioskParam = isKiosk ? "&kiosk=1" : "";
  const isEdit = !!editTarget;
  const isSeriesEdit = editTarget?.kind === "series";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflictModal, setConflictModal] =
    useState<ConflictModalState | null>(null);
  // 신청 확정 직전 출력 안내 모달용 — fd 가 들어 있으면 모달 노출
  const [submitConfirmFd, setSubmitConfirmFd] = useState<FormData | null>(null);

  const [name, setName] = useState(defaults?.applicant_name ?? "");
  // 신규 신청은 "010-" 프리필 — 모바일에서 010 매번 직접 입력하는 부담 제거.
  // 수정 모드는 기존 번호 그대로.
  const [phone, setPhone] = useState(
    defaults?.applicant_phone ?? "010-",
  );
  const phoneRef = useRef<HTMLInputElement>(null);

  // 포커스 시 "010-" 뒤로 커서 이동. 사용자가 010 부분 위에 커서 두지 않도록.
  // 이미 그 외 값이 입력되어 있으면 (수정 모드 또는 사용자가 일부 입력 후 다시 클릭)
  // 자연스러운 위치에 두기 위해 끝으로 보냄.
  const onPhoneFocus = () => {
    const inp = phoneRef.current;
    if (!inp) return;
    requestAnimationFrame(() => {
      const len = inp.value.length;
      try {
        inp.setSelectionRange(len, len);
      } catch {
        /* type=tel 일부 브라우저는 selectionRange 미지원 — 무시 */
      }
    });
  };

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(defaults?.date ?? today);
  const [endDate, setEndDate] = useState(defaults?.end_date ?? today);
  const [buildingId, setBuildingId] = useState(
    defaults?.building_id ?? buildings[0]?.id ?? "",
  );

  // 정기 신청 모드. 시리즈 수정 진입 시에는 강제 true (UI에서 토글 비활성).
  const [recurring, setRecurring] = useState<boolean>(
    !!defaults?.recurring || isSeriesEdit,
  );
  // 시간대 (정기 모드에서만 다중). 비정기는 첫 행만 사용.
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() => {
    if (defaults?.time_blocks && defaults.time_blocks.length > 0) {
      return defaults.time_blocks;
    }
    return [
      {
        start: defaults?.start_time ?? "09:00",
        end: defaults?.end_time ?? "11:00",
      },
    ];
  });
  // 사용자가 시간 입력을 한 번이라도 건드렸는지. 폼 진입 직후 기본값(09:00-11:00)
  // 으로 충돌 알림이 자동으로 뜨는 게 어색해서, 첫 입력 후에만 미리보기 노출.
  // 수정 모드(defaults?.time_blocks 또는 start_time 가 들어옴)는 이미 의도된 값이라
  // 처음부터 true.
  const [timeTouched, setTimeTouched] = useState<boolean>(
    !!defaults?.time_blocks?.length ||
      !!defaults?.start_time ||
      !!defaults?.end_time,
  );
  // 시작 날짜의 요일 (정기 모드에서 라벨에 노출)
  const startWeekday = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return new Date(`${date}T12:00:00+09:00`).getDay();
  }, [date]);
  // 정기 신청 회차 수 (시작 요일 기준으로 [start, end] 사이에 매주 몇 번 반복되는지)
  const seriesOccurrenceCount = useMemo(() => {
    if (startWeekday === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
    return computeWeeklyOccurrences(date, endDate, startWeekday).length;
  }, [date, endDate, startWeekday]);

  // 시작 날짜가 바뀌면 종료 날짜도 같은 값으로 동기화.
  // 다일 예약(예: 5/1~5/3) 이 필요한 경우 사용자가 시작 입력 후 종료를 따로 수정.
  function onStartDateChange(v: string) {
    setDate(v);
    setEndDate(v);
  }
  const visibleFloors = useMemo(
    () => floors.filter((f) => f.building_id === buildingId),
    [floors, buildingId],
  );
  const [floorId, setFloorId] = useState(
    defaults?.floor_id ?? visibleFloors[0]?.id ?? "",
  );
  const visibleRooms = useMemo(
    () => rooms.filter((r) => r.floor_id === floorId),
    [rooms, floorId],
  );
  // 호실 cascading 의 leaf — controlled 로 두어 AvailabilityPreview 가
  // roomId 변경을 감지할 수 있게.
  const [roomId, setRoomId] = useState<string>(
    defaults?.room_id ?? visibleRooms[0]?.id ?? "",
  );
  // 층이 바뀌어 현재 roomId 가 그 층의 호실 목록에 더 이상 없으면 첫 호실로 보정.
  // React 19 의 "render-time setState" 패턴 — 같은 컴포넌트 안이라 안전, 즉시 다시
  // render 되면서 새 값 적용. 조건이 false 가 되면 멈춤(무한 루프 X).
  if (
    visibleRooms.length > 0 &&
    !visibleRooms.some((r) => r.id === roomId)
  ) {
    setRoomId(visibleRooms[0].id);
  }

  // 부서 cascading: 그룹(대분류) → 소분류(leaf). dept_id 는 leaf 만.
  const deptGroups = useMemo(
    () =>
      [...departments]
        .filter((d) => d.parent_id === null)
        .sort((a, b) => a.display_order - b.display_order),
    [departments],
  );
  const deptLeavesByGroup = useMemo(() => {
    const map = new Map<string, Department[]>();
    for (const d of departments) {
      if (d.parent_id) {
        const arr = map.get(d.parent_id) ?? [];
        arr.push(d);
        map.set(d.parent_id, arr);
      }
    }
    for (const arr of map.values())
      arr.sort((a, b) => a.display_order - b.display_order);
    return map;
  }, [departments]);

  // 부서 선택 — 대분류(parent) → 소분류(leaf) cascading 두 개 select.
  // iOS Safari 동기화 버그는 placeholder 옵션에 `disabled` 를 안 붙이는 것으로 회피.
  const initialDeptLeaf = useMemo(
    () => departments.find((d) => d.id === defaults?.dept_id) ?? null,
    [departments, defaults?.dept_id],
  );
  const [deptGroupId, setDeptGroupId] = useState<string>(
    initialDeptLeaf?.parent_id ?? "",
  );
  const [deptId, setDeptId] = useState<string>(
    initialDeptLeaf?.parent_id ? initialDeptLeaf.id : "",
  );
  const visibleDeptLeaves = deptGroupId
    ? (deptLeavesByGroup.get(deptGroupId) ?? [])
    : [];

  // findRoomConflicts ↔ INSERT 사이 race 등으로 trigger 가 raw 에러를 던지는 경우,
  // 어떤 신청과 겹쳤는지 다시 조회해서 모달로 띄워준다. 모달 띄우는 데 성공하면 true.
  // forceOverlap=true 로 이미 진행한 케이스는 fall-through (트리거 우회 후 또 실패면 다른 원인).
  async function recoverConflictAndOpenModal(
    fd: FormData,
    isRecurring: boolean,
  ): Promise<boolean> {
    const roomId = String(fd.get("room_id") ?? "");
    if (!roomId) return false;

    if (isRecurring) {
      const sdate = String(fd.get("start_date") ?? "");
      const edate = String(fd.get("end_date") ?? sdate);
      let blocks: TimeBlock[] = [];
      try {
        blocks = JSON.parse(String(fd.get("time_blocks") ?? "[]"));
      } catch {
        return false;
      }
      if (!sdate || blocks.length === 0) return false;
      const occ = computeWeeklyOccurrences(
        sdate,
        edate,
        new Date(`${sdate}T12:00:00+09:00`).getDay(),
      );
      if (occ.length === 0) return false;
      const result = await findSeriesConflicts(roomId, occ, blocks, {
        excludeSeriesId:
          isSeriesEdit && editTarget ? editTarget.id : undefined,
      });
      if (result.occurrences.length === 0) return false;
      setConflictModal({ kind: "series", result, fd });
      return true;
    }

    const startTime = String(fd.get("start_time") ?? "");
    const endTime = String(fd.get("end_time") ?? "");
    const sdate = String(fd.get("date") ?? "");
    const edate = String(fd.get("end_date") ?? sdate) || sdate;
    if (!sdate || !startTime || !endTime) return false;
    const startAt = `${sdate}T${startTime}:00+09:00`;
    const endAt = `${edate}T${endTime}:00+09:00`;
    const result = await findRoomConflicts(
      roomId,
      startAt,
      endAt,
      isEdit && editTarget && editTarget.kind === "reservation"
        ? editTarget.id
        : undefined,
    );
    if (result.reservations.length === 0 && result.fixedEvents.length === 0)
      return false;
    setConflictModal({ kind: "single", result, fd });
    return true;
  }

  // 서버에러 처리 — 트리거의 "이미 예약" 라면 race 로 보고 모달 재오픈.
  async function handleSubmitError(
    err: string,
    fd: FormData,
    forceOverlap: boolean,
    isRecurring: boolean,
  ) {
    if (!forceOverlap && err.includes("이미 예약")) {
      const recovered = await recoverConflictAndOpenModal(fd, isRecurring);
      if (recovered) {
        setError(null);
        return;
      }
    }
    setError(err);
    setConflictModal(null);
  }

  // 실제 신청 제출. 충돌이 확정된 경우 forceOverlap=true 로 한 번 더 보내준다.
  function doSubmit(fd: FormData, forceOverlap: boolean) {
    startTransition(async () => {
      // === 시리즈 수정 ===
      if (isEdit && editTarget && editTarget.kind === "series") {
        fd.set("owner_name", editTarget.ownerName);
        fd.set("owner_phone", editTarget.ownerPhone);
        const res = await updateSeries(editTarget.id, fd, { forceOverlap });
        if (res.error) {
          await handleSubmitError(res.error, fd, forceOverlap, true);
          return;
        }
        if (res.id) {
          setConflictModal(null);
          router.push(`/series/${res.id}`);
        }
        return;
      }

      // === 일회성 수정 ===
      if (isEdit && editTarget) {
        fd.set("owner_name", editTarget.ownerName);
        fd.set("owner_phone", editTarget.ownerPhone);
        const res = await updateApplication(editTarget.id, fd, { forceOverlap });
        if (res.error) {
          await handleSubmitError(res.error, fd, forceOverlap, false);
          return;
        }
        if (res.id) {
          setConflictModal(null);
          router.push(`/reservations/${res.id}`);
        }
        return;
      }

      // === 새 시리즈 OR 다중 시간대 일회성 ===
      // recurring 토글이 꺼져 있어도 timeBlocks 가 2개 이상이면 시리즈 path 로 처리
      // (같은 날 N개 시간대 = 1회 × N 시리즈).
      if (recurring || timeBlocks.length > 1) {
        const res = await submitSeriesApplication(fd, { forceOverlap });
        if (res.error) {
          await handleSubmitError(res.error, fd, forceOverlap, true);
          return;
        }
        if (res.id) {
          setConflictModal(null);
          const submittedName = String(fd.get("applicant_name") ?? "").trim();
          const submittedPhone = String(fd.get("applicant_phone") ?? "").trim();
          if (submittedName && submittedPhone) {
            setMe({ name: submittedName, phone: submittedPhone });
          }
          router.push(`/series/${res.id}?just=1${kioskParam}`);
        }
        return;
      }

      // === 새 일회성 신청 ===
      const res = await submitApplication(fd, { forceOverlap });
      if (res.error) {
        await handleSubmitError(res.error, fd, forceOverlap, false);
        return;
      }
      if (res.id) {
        setConflictModal(null);
        const submittedName = String(fd.get("applicant_name") ?? "").trim();
        const submittedPhone = String(fd.get("applicant_phone") ?? "").trim();
        if (submittedName && submittedPhone) {
          setMe({ name: submittedName, phone: submittedPhone });
        }
        router.push(`/reservations/${res.id}?just=1${kioskParam}`);
      }
    });
  }

  return (
    <>
    <form
      className="space-y-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        // 과거 날짜 차단 (KST 기준)
        const todayKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date());
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          setError("시간 입력이 잘못되었습니다.");
          return;
        }
        if (date < todayKey) {
          setError(
            "시작 날짜가 지난 날짜입니다. 오늘 이후 날짜로 다시 입력해 주세요.",
          );
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) {
          setError("종료 날짜는 시작 날짜와 같거나 그 이후여야 합니다.");
          return;
        }
        // 시간대 검증 (정기·일회성 공통)
        const tbErr = validateTimeBlocks(timeBlocks);
        if (tbErr) {
          setError(tbErr);
          return;
        }

        const fd = new FormData(e.currentTarget);
        const roomId = String(fd.get("room_id") ?? "");

        // ===== 정기 OR 다중 시간대 일회성 =====
        // 다중 시간대(2개 이상) 는 일회성이라도 시리즈 path 로 처리.
        // - 정기 + 다중 시간대 = 매주 X요일 N개 시간대 점유 (정상 시리즈)
        // - 일회성 + 다중 시간대 = 같은 날 N개 시간대 (start_date == end_date 시리즈, 1회 × N)
        const useSeriesPath = recurring || timeBlocks.length > 1;
        if (useSeriesPath) {
          // 시리즈 폼은 start_date/end_date/time_blocks 만 사용 (단일 시간 필드 제거)
          fd.set("start_date", date);
          // 일회성 + 다중 시간대 케이스는 같은 날에 한정해 endDate=date 로 강제.
          // (다일 + 다중 시간대는 의도가 모호해서 같은날만 지원)
          const seriesEndDate = recurring ? endDate : date;
          fd.set("end_date", seriesEndDate);
          fd.set("time_blocks", JSON.stringify(timeBlocks));
          const occurrences = computeWeeklyOccurrences(
            date,
            seriesEndDate,
            new Date(`${date}T12:00:00+09:00`).getDay(),
          );
          if (occurrences.length === 0) {
            setError("선택한 기간 안에 회차가 없습니다.");
            return;
          }
          startTransition(async () => {
            const result = await findSeriesConflicts(
              roomId,
              occurrences,
              timeBlocks,
              {
                excludeSeriesId:
                  isSeriesEdit && editTarget ? editTarget.id : undefined,
              },
            );
            if (result.occurrences.length > 0) {
              setConflictModal({ kind: "series", result, fd });
              return;
            }
            // 충돌 없음 — 수정 모드는 바로 진행, 신규는 출력 안내 모달 거침
            if (isEdit) {
              doSubmit(fd, false);
            } else {
              setSubmitConfirmFd(fd);
            }
          });
          return;
        }

        // ===== 일회성 신청 =====
        const block = timeBlocks[0];
        fd.set("start_time", block.start);
        fd.set("end_time", block.end);
        const startAt = `${date}T${block.start}:00+09:00`;
        const endAt = `${endDate}T${block.end}:00+09:00`;

        startTransition(async () => {
          const result = await findRoomConflicts(
            roomId,
            startAt,
            endAt,
            isEdit && editTarget && editTarget.kind === "reservation"
              ? editTarget.id
              : undefined,
          );
          if (
            result.reservations.length > 0 ||
            result.fixedEvents.length > 0
          ) {
            setConflictModal({ kind: "single", result, fd });
            return;
          }
          // 충돌 없음 — 수정 모드는 바로 진행, 신규는 출력 안내 모달 거침
          if (isEdit) {
            doSubmit(fd, false);
          } else {
            setSubmitConfirmFd(fd);
          }
        });
      }}
    >
      <fieldset className="space-y-4">
        <legend className="mb-3 text-base font-semibold text-stone-900">
          신청자 정보
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="이름">
            <Input
              name="applicant_name"
              required
              maxLength={20}
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isEdit}
              disabled={isEdit}
            />
          </Field>
          <Field
            label="휴대폰"
            hint={isEdit ? "신청자 정보는 수정할 수 없습니다." : "결재 진행 알림에 사용됩니다"}
          >
            <Input
              ref={phoneRef}
              name="applicant_phone"
              required
              type="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
              // 010 + 4자리 + 4자리 (dash 옵셔널). 미완성 제출 시 브라우저가 즉시 거부.
              pattern="010-?\d{4}-?\d{4}"
              title="010 뒤 8자리(가운데 4 + 뒷 4)를 모두 입력해주세요."
              value={phone}
              onFocus={onPhoneFocus}
              onChange={(e) => setPhone(formatPhone(e.target.value, phone))}
              readOnly={isEdit}
              disabled={isEdit}
            />
          </Field>
        </div>
        <Field label="소속 부서">
          {/* 대분류(parent) → 소분류(leaf) 두 단계 select. placeholder 옵션에
              `disabled` 를 붙이면 iOS Safari 가 controlled value 와 동기화
              안 시키는 버그가 있어 빈 value 만 사용. */}
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={deptGroupId}
              onChange={(e) => {
                setDeptGroupId(e.target.value);
                setDeptId(""); // 대분류 바뀌면 소분류 리셋
              }}
              aria-label="대분류"
            >
              <option value="">대분류 선택</option>
              {deptGroups.map((g) => {
                const leaves = deptLeavesByGroup.get(g.id) ?? [];
                if (leaves.length === 0) return null;
                return (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                );
              })}
            </Select>
            <Select
              name="dept_id"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              aria-label="소분류"
              required
              disabled={!deptGroupId}
            >
              <option value="">
                {deptGroupId ? "소분류 선택" : "대분류 먼저"}
              </option>
              {visibleDeptLeaves.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-stone-200 pt-5">
        <legend className="mb-3 text-base font-semibold text-stone-900">
          사용 장소
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="건물">
            <Select
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                const f = floors.find((x) => x.building_id === e.target.value);
                setFloorId(f?.id ?? "");
              }}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="층">
            <Select
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
            >
              {visibleFloors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="호실">
            <Select
              name="room_id"
              required
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              {visibleRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-stone-200 pt-5">
        <legend className="mb-3 text-base font-semibold text-stone-900">
          사용 일시
        </legend>

        {/* 정기 신청 토글 — 켜졌을 때 시각적으로 강조해서 실수 방지 */}
        <label
          className={cn(
            "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 transition-colors",
            recurring
              ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
              : "border-stone-200 bg-stone-50",
          )}
        >
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            disabled={isSeriesEdit}
            className="h-5 w-5"
          />
          <span
            className={cn(
              "text-base font-medium",
              recurring ? "text-brand-700" : "text-stone-800",
            )}
          >
            매주 정기로 사용
          </span>
          <span className="ml-1 text-sm text-stone-500">
            (매주 같은 요일·시간 반복인 경우)
          </span>
        </label>

        <p className="text-sm text-stone-500">
          {recurring
            ? "시작 날짜의 요일이 곧 반복 요일이 됩니다."
            : "하루 안에 끝나면 종료 날짜를 시작 날짜와 같게 두면 됩니다."}
        </p>

        {/* 정기 미체크인데 시작·종료 날짜가 7일 이상 벌어져 있으면 안내 */}
        {!recurring &&
          /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
          (() => {
            const ds = Date.parse(`${date}T00:00:00+09:00`);
            const de = Date.parse(`${endDate}T00:00:00+09:00`);
            const diffDays = Math.round((de - ds) / (1000 * 60 * 60 * 24));
            if (diffDays < 7) return null;
            return (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold">
                  ⚠️ {diffDays}일 동안 <u>연속</u>으로 사용 신청이 됩니다.
                </div>
                <div className="mt-1">
                  매주 같은 요일에만 반복 사용하실 거면, 위의{" "}
                  <strong className="font-semibold">
                    “매주 정기로 사용”
                  </strong>{" "}
                  를 체크해 주세요.
                </div>
              </div>
            );
          })()}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={
              recurring && startWeekday !== null
                ? `시작 날짜 (${weekdayLabel(startWeekday)}요일)`
                : "시작 날짜"
            }
            hint={describeDateInMonth(date)}
          >
            <div className="relative">
              <Input
                type="text"
                name="date"
                required
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                maxLength={10}
                pattern="\d{4}-\d{2}-\d{2}"
                value={date}
                className="pr-12"
                onKeyDown={(e) => {
                  // 완성된 YYYY-MM-DD + 숫자 한 자 → 일(DD) 시프트
                  const next = shiftDayDigit(date, e.key);
                  if (next) {
                    e.preventDefault();
                    onStartDateChange(next);
                  }
                }}
                onChange={(e) =>
                  onStartDateChange(formatDateInput(e.target.value))
                }
              />
              <DatePickerOverlay value={date} onPick={onStartDateChange} />
            </div>
          </Field>
          <Field
            label={
              recurring
                ? seriesOccurrenceCount && seriesOccurrenceCount > 0
                  ? `반복 종료일 (총 ${seriesOccurrenceCount}회 반복)`
                  : "반복 종료일"
                : "종료 날짜"
            }
            hint={
              recurring
                ? "이 날짜까지 매주 반복"
                : "기본값은 시작 날짜와 같음"
            }
          >
            <div className="relative">
              <Input
                type="text"
                name="end_date"
                required
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                maxLength={10}
                pattern="\d{4}-\d{2}-\d{2}"
                value={endDate}
                className="pr-12"
                onKeyDown={(e) => {
                  const next = shiftDayDigit(endDate, e.key);
                  if (next) {
                    e.preventDefault();
                    setEndDate(next);
                  }
                }}
                onChange={(e) => setEndDate(formatDateInput(e.target.value))}
              />
              <DatePickerOverlay value={endDate} onPick={setEndDate} />
            </div>
          </Field>
        </div>

        {/* 시간대 — 정기 모드에서는 [+ 시간대 추가] 버튼 노출.
            각 시간대 row 아래에 AvailabilityPreview 를 두어 시간대별로 충돌 가시화.
            정기 모드의 경우 첫 회차 날짜(date) 기준 빠른 미리보기 — 정확한 전체
            회차 충돌은 제출 시 findSeriesConflicts 가 검증. */}
        <div className="space-y-3">
          {timeBlocks.map((block, idx) => (
            <div key={idx} className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:gap-3">
                <Field label={idx === 0 ? "시작 시간" : `시작 시간 #${idx + 1}`}>
                  <Input
                    type="time"
                    required
                    value={block.start}
                    onChange={(e) => {
                      setTimeTouched(true);
                      const next = e.target.value;
                      setTimeBlocks((arr) =>
                        arr.map((b, i) => {
                          if (i !== idx) return b;
                          // 같은날에서 새 시작 ≥ 기존 종료가 되면 종료를 시작+1h 로 자동 보정.
                          // 다일 신청(date != endDate)은 사용자가 의도한 거라 그대로 둠.
                          const sameDay = endDate === date;
                          const needsBump =
                            sameDay &&
                            /^\d{2}:\d{2}$/.test(next) &&
                            /^\d{2}:\d{2}$/.test(b.end) &&
                            next >= b.end;
                          return {
                            ...b,
                            start: next,
                            end: needsBump ? timePlusOneHour(next) : b.end,
                          };
                        }),
                      );
                    }}
                  />
                </Field>
                <Field label={idx === 0 ? "종료 시간" : `종료 시간 #${idx + 1}`}>
                  <Input
                    type="time"
                    required
                    value={block.end}
                    onChange={(e) => {
                      setTimeTouched(true);
                      // 종료 시간은 사용자가 입력한 그대로 — 자동 보정 안 함.
                      // 시작 변경 시점에만 시작+1h 로 한 번 보정해 두고, 이후엔
                      // 사용자가 자유롭게 조정. 종료가 시작보다 빠른 경우의 검증은
                      // 폼 submit 단계의 validateTimeBlocks 가 담당.
                      setTimeBlocks((arr) =>
                        arr.map((b, i) =>
                          i === idx ? { ...b, end: e.target.value } : b,
                        ),
                      );
                    }}
                  />
                </Field>
                {timeBlocks.length > 1 && (
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() =>
                        setTimeBlocks((arr) =>
                          arr.filter((_, i) => i !== idx),
                        )
                      }
                      className="text-stone-500 hover:text-red-600"
                      aria-label={`시간대 #${idx + 1} 제거`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {/* 사용자가 시간 입력을 한 번이라도 만진 후에만 미리보기 노출.
                  폼 진입 직후 기본값(09:00-11:00) 으로 자동 충돌 알림이 뜨는
                  어색함 제거. */}
              {timeTouched && (
                <AvailabilityPreview
                  roomId={roomId}
                  date={date}
                  startTime={block.start}
                  endTime={block.end}
                  excludeReservationId={
                    isEdit && editTarget?.kind === "reservation"
                      ? editTarget.id
                      : undefined
                  }
                  excludeSeriesId={isSeriesEdit ? editTarget?.id : undefined}
                />
              )}
            </div>
          ))}
          {timeBlocks.length < MAX_TIME_BLOCKS && (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setTimeBlocks((arr) => [
                    ...arr,
                    { start: "18:00", end: "20:00" },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                시간대 추가
              </Button>
            </div>
          )}
        </div>

        {/* 정기 신청 미리보기 — 회차/시간대 합산 결과를 한 줄로 안내 */}
        {recurring && startWeekday !== null && (
          <div className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            <span className="font-semibold">
              매주 {weekdayLabel(startWeekday)}요일 ·{" "}
            </span>
            {describeSeries({
              weekday: startWeekday,
              startDate: date,
              endDate,
              timeBlocks,
            }).split("·").slice(1).join("·").trim()}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4 border-t border-stone-200 pt-5">
        <legend className="mb-3 text-base font-semibold text-stone-900">
          사용 목적
        </legend>
        <Field label="목적/행사명" hint="예: 청년부 수련회 사전모임">
          <Input
            name="purpose"
            required
            maxLength={80}
            defaultValue={defaults?.purpose ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="참석 인원">
            <Input
              type="number"
              name="attendee_count"
              required
              min={1}
              defaultValue={defaults?.attendee_count ?? 10}
            />
          </Field>
          <Field label="외부 행사 여부">
            <label className="flex h-11 items-center gap-2">
              <input
                type="checkbox"
                name="is_external"
                className="h-5 w-5"
                defaultChecked={defaults?.is_external ?? false}
              />
              <span className="text-stone-700">외부 단체 또는 공동진행인 경우</span>
            </label>
          </Field>
        </div>
        <Field label="비고 (선택)">
          <Textarea
            name="notes"
            maxLength={500}
            defaultValue={defaults?.notes ?? ""}
          />
        </Field>
        {/* 1주일 미만 경고 — 사용일이 오늘부터 7일 이내일 때만 노출.
            결재선 통과까지 시간이 빠듯하다는 안내. */}
        {(() => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
          const todayKey = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Seoul",
          }).format(new Date());
          const today = new Date(`${todayKey}T00:00:00+09:00`);
          const target = new Date(`${date}T00:00:00+09:00`);
          const days = Math.ceil(
            (target.getTime() - today.getTime()) / 86_400_000,
          );
          if (days < 0 || days >= 7) return null;
          return (
            <p className="rounded-lg bg-brand-50 p-4 text-sm leading-relaxed text-brand-700">
              원활한 결재 진행을 위해{" "}
              <strong className="font-semibold">사용 예정일 최소 1주일 전</strong>
              에 신청해 주시기를 부탁드립니다.
            </p>
          );
        })()}
      </fieldset>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-stone-200 pt-5">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={pending} size="lg">
          {pending
            ? isEdit
              ? "수정 중..."
              : "신청 중..."
            : isEdit
              ? "수정 저장"
              : "신청하기"}
        </Button>
      </div>
    </form>

    <ConflictModal
      data={
        conflictModal === null
          ? null
          : conflictModal.kind === "single"
            ? { kind: "single", result: conflictModal.result }
            : { kind: "series", result: conflictModal.result }
      }
      pending={pending}
      onCancel={() => setConflictModal(null)}
      onConfirm={() => {
        if (!conflictModal) return;
        doSubmit(conflictModal.fd, true);
      }}
    />

    {/* 출력 안내 모달 — 충돌 없이 진짜 신청 직전에 한 번 더 확인. 수정 모드는 우회.
        디자인: 종이가 프린터에서 막 빠져나오는 모티브로 "지금 종이가 출력될 거예요"
        를 시각적으로 전달. 어르신 가독성을 위해 본문 큼직한 활자 + 핵심 정보는
        chip 형태로 강조. */}
    {submitConfirmFd && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="신청 확인"
        className="animate-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-stone-900/55 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) setSubmitConfirmFd(null);
        }}
      >
        <div className="animate-modal-panel relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.25)] ring-1 ring-stone-900/5">
          {/* 상단 — 프린터에서 종이가 빠져나오는 시각적 모티브 */}
          <div className="bg-paper-grain relative bg-gradient-to-b from-amber-50 via-amber-50/50 to-white px-8 pt-9 pb-7">
            <div className="relative mx-auto h-20 w-20">
              {/* 프린터 아이콘 — 진한 amber 배경의 둥근 사각 */}
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200/80 shadow-inner ring-1 ring-amber-300/60">
                <Printer
                  className="h-9 w-9 text-amber-700"
                  strokeWidth={2.2}
                  aria-hidden
                />
              </div>
              {/* 빠져나오는 종이 — animate-paper-emerge 로 1.6s 동안 슬쩍 내려옴 */}
              <div
                className="animate-paper-emerge absolute left-1/2 top-full flex h-9 w-12 items-center justify-center rounded-md border border-amber-300 bg-white shadow-md"
                aria-hidden
              >
                {/* 종이 위에 작은 가로선들 — 본문 텍스트 흉내 */}
                <div className="space-y-1">
                  <div className="h-0.5 w-7 rounded-full bg-amber-300/80" />
                  <div className="h-0.5 w-5 rounded-full bg-amber-300/60" />
                  <div className="h-0.5 w-6 rounded-full bg-amber-300/70" />
                </div>
              </div>
            </div>
          </div>

          {/* 본문 */}
          <div className="px-8 pt-12 pb-7 text-center">
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-stone-900 sm:text-[26px]">
              정말 신청하시겠습니까?
            </h2>
            <p className="mb-5 text-base leading-relaxed text-stone-600">
              <strong className="font-semibold text-stone-900">신청하기</strong>{" "}
              를 누르는 순간
            </p>
            {/* 핵심 정보 — chip 으로 강조해 한눈에 들어오게 */}
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-base font-semibold text-amber-900 ring-1 ring-amber-300/70 shadow-sm">
              <Printer className="h-4 w-4 flex-none" aria-hidden />
              사무실 프린터로 자동 출력됩니다
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-stone-500">
              <FileText className="h-3.5 w-3.5" aria-hidden />
              대면 결재용 종이 서류
            </p>
          </div>

          {/* 푸터 — 두 버튼 동등 폭, 1차 액션은 우측 + 아이콘 */}
          <div className="flex gap-3 border-t border-stone-200/70 bg-stone-50/70 px-6 py-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSubmitConfirmFd(null)}
              disabled={pending}
              size="lg"
              className="flex-1"
            >
              취소
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={pending}
              className="flex-1"
              onClick={() => {
                const fd = submitConfirmFd;
                setSubmitConfirmFd(null);
                doSubmit(fd, false);
              }}
            >
              {pending ? (
                "신청 중..."
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  신청하기
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
