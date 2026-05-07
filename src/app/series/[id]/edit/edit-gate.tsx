"use client";

import Link from "next/link";
import type {
  Building,
  Department,
  Floor,
  Room,
} from "@/lib/supabase/types";
import { ApplyForm, type ApplyFormDefaults } from "@/app/apply/apply-form";
import { Button } from "@/components/ui/button";
import { isOwner, useMe } from "@/lib/me";

type Props = {
  seriesId: string;
  applicantName: string;
  applicantPhone: string;
  editable: boolean;
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  departments: Department[];
  defaults: ApplyFormDefaults;
};

export function EditSeriesGate(props: Props) {
  const { me, hydrated } = useMe();
  const verdict: "checking" | "ok" | "denied" = !hydrated
    ? "checking"
    : isOwner(me, {
          name: props.applicantName,
          phone: props.applicantPhone,
        })
      ? "ok"
      : "denied";

  if (verdict === "checking") {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-500">
        본인 확인 중…
      </div>
    );
  }

  if (verdict === "denied") {
    return (
      <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-red-800">
        <h2 className="mb-2 text-lg font-semibold">수정 권한이 없습니다</h2>
        <p className="mb-4 text-sm">
          본인이 작성한 시리즈만 수정할 수 있습니다.
        </p>
        <div className="flex gap-2">
          <Link href={`/series/${props.seriesId}/print`}>
            <Button variant="secondary">인쇄 페이지로</Button>
          </Link>
          <Link href="/reservations">
            <Button variant="ghost">목록으로</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!props.editable) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-amber-900">
        <h2 className="mb-2 text-lg font-semibold">수정할 수 없는 단계입니다</h2>
        <p className="mb-4 text-sm">
          이미 결재가 진행됐거나 마감된 시리즈는 수정이 불가합니다. 변경이
          필요하면 시리즈를 삭제 후 새로 작성해 주세요.
        </p>
        <div className="flex gap-2">
          <Link href={`/series/${props.seriesId}/print`}>
            <Button variant="secondary">인쇄 페이지로</Button>
          </Link>
          <Link href="/reservations">
            <Button variant="ghost">목록으로</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ApplyForm
      buildings={props.buildings}
      floors={props.floors}
      rooms={props.rooms}
      departments={props.departments}
      defaults={props.defaults}
      editTarget={{
        kind: "series",
        id: props.seriesId,
        ownerName: props.applicantName,
        ownerPhone: props.applicantPhone,
      }}
    />
  );
}
