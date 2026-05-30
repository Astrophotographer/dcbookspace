"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteNotificationSubscriber } from "./actions";

type Props = {
  channel: "telegram" | "discord";
  subscriberId: string;
  name: string;
};

export function DeleteSubscriberButton({ channel, subscriberId, name }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const channelLabel = channel === "discord" ? "디스코드" : "텔레그램";

  const onClick = () => {
    if (
      !window.confirm(
        `${name} 님의 ${channelLabel} 알림봇 신청 정보를 삭제할까요?\n삭제하면 이 사람에게 더 이상 ${channelLabel} 알림이 가지 않습니다.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const res = await deleteNotificationSubscriber(channel, subscriberId);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`${name} ${channelLabel} 알림봇 신청 삭제`}
      aria-busy={pending}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
      {pending ? "삭제 중" : "삭제"}
    </button>
  );
}
