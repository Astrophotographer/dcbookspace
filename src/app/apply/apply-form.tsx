"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Building,
  Department,
  Floor,
  Room,
} from "@/lib/supabase/types";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConflictModal } from "@/components/ui/conflict-modal";
import { setMe } from "@/lib/me";
import {
  findRoomConflicts,
  submitApplication,
  updateApplication,
  type ConflictInfo,
} from "./actions";

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
};

type EditTarget = {
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

// 한국 휴대폰 포맷: 010-XXXX-XXXX
// 사용자가 0으로 시작하지 않으면 010 prefix를 자동으로 붙여 입력 편의성 ↑
function formatPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d[0] !== "0") d = "010" + d;
  d = d.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

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
  const isEdit = !!editTarget;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 충돌 안내 모달: 충돌 목록 + 다시 제출할 FormData 스냅샷을 함께 들고 있는다.
  const [conflictModal, setConflictModal] = useState<{
    conflicts: ConflictInfo[];
    fd: FormData;
  } | null>(null);

  const [name, setName] = useState(defaults?.applicant_name ?? "");
  const [phone, setPhone] = useState(defaults?.applicant_phone ?? "");

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(defaults?.date ?? today);
  const [endDate, setEndDate] = useState(defaults?.end_date ?? today);
  const [buildingId, setBuildingId] = useState(
    defaults?.building_id ?? buildings[0]?.id ?? "",
  );

  // 시작 날짜 변경 시 종료가 더 빠르면 시작과 같게 자동 동기화
  function onStartDateChange(v: string) {
    setDate(v);
    if (endDate < v) setEndDate(v);
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

  // 실제 신청 제출. 충돌이 확정된 경우 forceOverlap=true 로 한 번 더 보내준다.
  function doSubmit(fd: FormData, forceOverlap: boolean) {
    startTransition(async () => {
      if (isEdit && editTarget) {
        // 수정 모드: 본인 검증을 위해 owner 정보 동봉
        fd.set("owner_name", editTarget.ownerName);
        fd.set("owner_phone", editTarget.ownerPhone);
        const res = await updateApplication(editTarget.id, fd, { forceOverlap });
        if (res.error) {
          setError(res.error);
          setConflictModal(null);
          return;
        }
        if (res.id) {
          setConflictModal(null);
          router.push(`/reservations/${res.id}/print`);
        }
        return;
      }

      const res = await submitApplication(fd, { forceOverlap });
      if (res.error) {
        setError(res.error);
        setConflictModal(null);
        return;
      }
      if (res.id) {
        setConflictModal(null);
        // 본인 정보 기억 → 다음에 모든신청내역에서 수정/삭제 노출에 사용
        const submittedName = String(fd.get("applicant_name") ?? "").trim();
        const submittedPhone = String(fd.get("applicant_phone") ?? "").trim();
        if (submittedName && submittedPhone) {
          setMe({ name: submittedName, phone: submittedPhone });
        }
        // 신청 완료 → QR 포함 결재 서류를 새 창에서 자동 인쇄
        window.open(`/reservations/${res.id}/print`, "_blank");
        router.push(`/reservations/${res.id}?just=1`);
      }
    });
  }

  return (
    <>
    <form
      className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        // 과거 날짜 차단 (KST 기준)
        const todayKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date());
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayKey) {
          setError("시간 입력이 잘못되었습니다.");
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date) {
          setError("종료 날짜는 시작 날짜와 같거나 그 이후여야 합니다.");
          return;
        }
        const fd = new FormData(e.currentTarget);
        const roomId = String(fd.get("room_id") ?? "");
        const startTime = String(fd.get("start_time") ?? "");
        const endTime = String(fd.get("end_time") ?? "");
        const startAt = `${date}T${startTime}:00+09:00`;
        const endAt = `${endDate}T${endTime}:00+09:00`;

        startTransition(async () => {
          // 1차 경고: 같은 호실·시간에 이미 예약이 있는지 사전 조회.
          // 수정 모드에서는 자기 자신을 제외해야 자가 충돌이 안 잡힌다.
          const conflicts = await findRoomConflicts(
            roomId,
            startAt,
            endAt,
            isEdit && editTarget ? editTarget.id : undefined,
          );
          if (conflicts.length > 0) {
            // window.confirm 대신 디자인된 모달로 안내. 사용자의 선택을 기다림.
            setConflictModal({ conflicts, fd });
            return;
          }
          doSubmit(fd, false);
        });
      }}
    >
      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-semibold text-stone-800">
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
              name="applicant_phone"
              required
              type="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
              pattern="[0-9\-]{9,13}"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              readOnly={isEdit}
              disabled={isEdit}
            />
          </Field>
        </div>
        <Field label="소속 부서">
          <Select name="dept_id" required defaultValue={defaults?.dept_id ?? ""}>
            <option value="">선택하세요</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-stone-200 pt-5">
        <legend className="mb-2 text-lg font-semibold text-stone-800">
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
              defaultValue={defaults?.room_id ?? ""}
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
        <legend className="mb-2 text-lg font-semibold text-stone-800">
          사용 일시
        </legend>
        <p className="text-sm text-stone-500">
          하루 안에 끝나면 종료 날짜를 시작 날짜와 같게 두면 됩니다.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="시작 날짜" hint="YYYY-MM-DD">
            <Input
              type="text"
              name="date"
              required
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              pattern="\d{4}-\d{2}-\d{2}"
              value={date}
              onChange={(e) => onStartDateChange(formatDateInput(e.target.value))}
            />
          </Field>
          <Field label="종료 날짜" hint="기본값은 시작 날짜와 같음">
            <Input
              type="text"
              name="end_date"
              required
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              pattern="\d{4}-\d{2}-\d{2}"
              value={endDate}
              onChange={(e) => setEndDate(formatDateInput(e.target.value))}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="시작 시간">
            <Input
              type="time"
              name="start_time"
              required
              defaultValue={defaults?.start_time ?? "09:00"}
            />
          </Field>
          <Field label="종료 시간">
            <Input
              type="time"
              name="end_time"
              required
              defaultValue={defaults?.end_time ?? "11:00"}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-stone-200 pt-5">
        <legend className="mb-2 text-lg font-semibold text-stone-800">
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
              <span className="text-stone-700">외부 단체와 공동 진행</span>
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
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          참석 인원 50명 이상이거나 외부 행사일 경우 담임목사님 결재까지
          자동으로 추가됩니다.
        </p>
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
      conflicts={conflictModal?.conflicts ?? null}
      pending={pending}
      onCancel={() => setConflictModal(null)}
      onConfirm={() => {
        if (!conflictModal) return;
        doSubmit(conflictModal.fd, true);
      }}
    />
    </>
  );
}
