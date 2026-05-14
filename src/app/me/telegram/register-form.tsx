"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  LinkIcon,
  Send,
} from "lucide-react";
import type { Department } from "@/lib/supabase/types";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  requestAutoLink,
  sendRegisteredTestMessage,
  submitManual,
} from "./actions";

type Props = {
  departments: Department[];
  botUsername: string;
  autoEnabled: boolean;
  prefillName?: string;
  prefillPhone?: string;
};

type Mode = "auto" | "manual";
type DeptScope = "home" | "all";
type EventChoiceId =
  | "created"
  | "step_approved"
  | "approved"
  | "rejected"
  | "cancelled";

const EVENT_OPTIONS: Array<{
  id: EventChoiceId;
  label: string;
  description: string;
}> = [
  {
    id: "created",
    label: "접수",
    description: "새 신청서가 접수될 때",
  },
  {
    id: "step_approved",
    label: "결재 승인",
    description: "결재 단계가 하나씩 승인될 때",
  },
  {
    id: "approved",
    label: "완료",
    description: "신청이 최종 완료될 때",
  },
  {
    id: "rejected",
    label: "반려",
    description: "신청이 반려될 때",
  },
  {
    id: "cancelled",
    label: "취소",
    description: "예약이 취소될 때",
  },
];

const DEFAULT_EVENT_CHOICES: EventChoiceId[] = [
  "created",
  "approved",
  "rejected",
];

const inputClass =
  "h-[50px] w-full rounded-lg border border-[#c9c1b2] bg-white px-3 text-base text-[#1f2726] outline-none transition focus:border-[#0b6f70] focus:ring-4 focus:ring-[#0b6f70]/15 disabled:bg-[#ece8df] disabled:text-[#8a928f]";

const selectClass = inputClass;

function normalizePhone(raw: string, prev?: string) {
  const next = formatPhone(raw, prev);
  if (!next || next === "010") return "010-";
  return next;
}

export function TelegramRegisterForm({
  departments,
  botUsername,
  autoEnabled,
  prefillName = "",
  prefillPhone = "",
}: Props) {
  const [mode, setMode] = useState<Mode>("auto");
  const [pending, startTransition] = useTransition();
  const [testPending, startTestTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [name, setName] = useState(prefillName);
  const [phone, setPhone] = useState(
    prefillPhone ? normalizePhone(prefillPhone) : "010-",
  );

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
    for (const arr of map.values()) {
      arr.sort((a, b) => a.display_order - b.display_order);
    }
    return map;
  }, [departments]);

  const [deptGroupId, setDeptGroupId] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const visibleDeptLeaves = deptGroupId
    ? deptLeavesByGroup.get(deptGroupId) ?? []
    : [];
  const selectedDeptName =
    departments.find((d) => d.id === deptId)?.name ?? "미선택";
  const [deptScope, setDeptScope] = useState<DeptScope>("home");
  const selectedScopeLabel =
    deptScope === "all" ? "모든 부서" : selectedDeptName;
  const [selectedEventIds, setSelectedEventIds] = useState<EventChoiceId[]>(
    DEFAULT_EVENT_CHOICES,
  );
  const selectedEventSummary =
    EVENT_OPTIONS.filter((option) => selectedEventIds.includes(option.id))
      .map((option) => option.label)
      .join(", ") || "미선택";

  const [chatId, setChatId] = useState("");
  const [link, setLink] = useState<{
    deepLinkUrl: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [linked, setLinked] = useState<{
    name: string;
    scopeLabel: string;
  } | null>(null);

  useEffect(() => {
    if (!link || linked) return;
    let stop = false;
    const id = setInterval(async () => {
      if (stop) return;
      try {
        const res = await fetch(
          `/api/telegram/link/status?token=${encodeURIComponent(link.token)}`,
        );
        const json = await res.json();
        if (stop) return;
        if (json.linked) {
          setLinked({
            name: json.name ?? name,
            scopeLabel: json.scope_label ?? selectedScopeLabel,
          });
          clearInterval(id);
        } else if (json.expired) {
          setError("연결 대기 시간이 지났습니다. 다시 시도해 주세요.");
          setLink(null);
          clearInterval(id);
        }
      } catch {
        /* 일시 네트워크 오류 — 다음 poll 에서 다시 시도 */
      }
    }, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [link, linked, name, selectedScopeLabel]);

  const sharedValid =
    !!name.trim() &&
    phone.replace(/\D/g, "").length === 11 &&
    !!deptId &&
    selectedEventIds.length > 0;
  const currentChatId = linked
    ? "등록 완료"
    : link
      ? "자동 연결 대기 중"
      : chatId.trim() || "대기 중";

  const buildFormData = (): FormData => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("phone", phone);
    fd.set("dept_id", deptId);
    fd.set("dept_scope", deptScope);
    for (const eventId of selectedEventIds) {
      fd.append("event_ids", eventId);
    }
    return fd;
  };

  const toggleEvent = (eventId: EventChoiceId) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId],
    );
    setError(null);
  };

  const onAutoConnect = () => {
    if (!sharedValid) {
      setError("이름, 휴대폰, 소속 부서, 이벤트 알림을 모두 선택해 주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await requestAutoLink(buildFormData());
      if (!res.ok || !res.deepLinkUrl || !res.token || !res.expiresAt) {
        setError(res.error ?? "자동 연결 준비에 실패했습니다.");
        return;
      }
      setLink({
        deepLinkUrl: res.deepLinkUrl,
        token: res.token,
        expiresAt: res.expiresAt,
      });
      if (
        typeof window !== "undefined" &&
        /Mobi|Android/i.test(navigator.userAgent)
      ) {
        window.location.href = res.deepLinkUrl;
      }
    });
  };

  const onManualSubmit = () => {
    if (!sharedValid) {
      setError("이름, 휴대폰, 소속 부서, 이벤트 알림을 모두 선택해 주세요.");
      return;
    }
    if (!/^-?\d+$/.test(chatId.trim())) {
      setError("텔레그램 숫자 ID는 숫자만 입력해 주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = buildFormData();
      fd.set("chat_id", chatId.trim());
      const res = await submitManual(fd);
      if (!res.ok) {
        setError(res.error ?? "등록에 실패했습니다.");
        return;
      }
      setLinked({ name, scopeLabel: selectedScopeLabel });
      setTestResult("테스트 메시지를 보냈습니다.");
    });
  };

  const onSendTestMessage = () => {
    if (!linked) {
      setError("텔레그램 연결 완료 후 테스트 메시지를 보낼 수 있습니다.");
      return;
    }
    setError(null);
    setTestResult(null);
    startTestTransition(async () => {
      const res = await sendRegisteredTestMessage(buildFormData());
      if (!res.ok) {
        setTestResult(res.error ?? "테스트 메시지 발송에 실패했습니다.");
        return;
      }
      setTestResult("테스트 메시지를 보냈습니다.");
    });
  };

  return (
    <div className="space-y-5 text-[#1f2726]">
      <RegistrationHeader botUsername={botUsername} />

      <section className="rounded-lg border border-[#ded9cd] border-l-[7px] border-l-[#0b6f70] bg-white p-4 shadow-[0_12px_30px_rgba(31,39,38,0.07)]">
        <div>
          <p className="mb-1 font-black text-[#1f2726]">
            텔레그램을 통한 신청 현황 실시간 알림 서비스
          </p>
          <p className="m-0 text-[#65706d]">
            부서별 신청서의 진행 상태(접수, 반려, 완료)를 실시간으로
            확인하고 싶으시다면, 등록하기 페이지에서 텔레그램 봇 아이디를
            등록해 주세요.
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main
          id="register"
          className="overflow-hidden rounded-lg border border-[#ded9cd] bg-[#fffdf8]/95 shadow-[0_18px_45px_rgba(31,39,38,0.09)]"
        >
          <ProgressBar
            profileDone={sharedValid}
            connectDone={!!link || !!chatId.trim()}
            completeDone={!!linked}
          />

          <StepCard number={1} title="본인 정보">
            <p className="mb-4 text-[#65706d]">
              알림 구독자 식별을 위해 이름, 휴대폰, 소속 대분류/중분류를
              입력합니다.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <FieldBlock label="이름">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 홍길동"
                  maxLength={20}
                  autoComplete="name"
                />
              </FieldBlock>
              <FieldBlock label="휴대폰" hint="010-1234-5678">
                <input
                  className={inputClass}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(normalizePhone(e.target.value, phone))}
                  maxLength={13}
                  placeholder="010-"
                />
              </FieldBlock>
              <FieldBlock label="소속 대분류">
                <select
                  className={selectClass}
                  value={deptGroupId}
                  onChange={(e) => {
                    setDeptGroupId(e.target.value);
                    setDeptId("");
                  }}
                >
                  <option value="">대분류 선택</option>
                  {deptGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </FieldBlock>
              <FieldBlock label="소속 중분류(부서)">
                <select
                  className={selectClass}
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  disabled={!deptGroupId}
                >
                  <option value="">
                    {deptGroupId ? "중분류 선택" : "대분류 먼저 선택"}
                  </option>
                  {visibleDeptLeaves.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FieldBlock>
            </div>
          </StepCard>

          <StepCard number={2} title="알림 받을 범위">
            <p className="mb-4 text-[#65706d]">
              받을 부서 범위와 이벤트 알림 종류를 선택합니다.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock label="부서 범위">
                <select
                  className={selectClass}
                  value={deptScope}
                  onChange={(e) => {
                    setDeptScope(e.target.value as DeptScope);
                    setError(null);
                  }}
                >
                  <option value="home">본인 소속 부서만</option>
                  <option value="all">모든 부서</option>
                </select>
              </FieldBlock>
              <EventChoicePanel
                selectedEventIds={selectedEventIds}
                onToggle={toggleEvent}
              />
            </div>
          </StepCard>

          <StepCard number={3} title="텔레그램 연결">
            <p className="mb-4 text-[#65706d]">
              추천 방식은 텔레그램 앱에서 교회 알림봇을 직접 시작하는
              것입니다. Start를 누르면 n8n이 대화 정보를 받아 자동으로
              저장합니다.
            </p>
            <div className="mb-4 inline-flex rounded-full bg-[#ebe7dd] p-1">
              <ModeTab
                active={mode === "auto"}
                onClick={() => setMode("auto")}
              >
                자동 연결
              </ModeTab>
              <ModeTab
                active={mode === "manual"}
                onClick={() => setMode("manual")}
              >
                수동 입력
              </ModeTab>
            </div>

            {mode === "auto" ? (
              <AutoFlow
                link={link}
                onAutoConnect={onAutoConnect}
                pending={pending}
                disabled={!sharedValid || !autoEnabled}
                autoEnabled={autoEnabled}
              />
            ) : (
              <ManualFlow
                chatId={chatId}
                onChange={setChatId}
                onSubmit={onManualSubmit}
                pending={pending}
                disabled={!sharedValid || !autoEnabled}
              />
            )}

            {error && <Callout tone="error">{error}</Callout>}
          </StepCard>

          <StepCard number={4} title="테스트 메시지">
            <p className="mb-4 text-[#65706d]">
              자동 연결은 봇 시작 후 확인 메시지가 도착합니다. 수동 입력은
              등록 버튼을 누르면 테스트 메시지를 바로 보냅니다.
            </p>
            <TestStatusCard
              name={name}
              scope={selectedScopeLabel}
              events={selectedEventSummary}
              telegramStatus={currentChatId}
              onSendTest={onSendTestMessage}
              pending={testPending}
              disabled={!linked}
              result={testResult}
            />
          </StepCard>

          <StepCard number={5} title="완료 화면" last>
            <Callout tone="ok">
              {linked
                ? `${linked.name} 님의 ${linked.scopeLabel} 알림 연결이 완료됐습니다. 테스트 메시지는 위 버튼으로 다시 확인할 수 있습니다.`
                : "아직 등록 전입니다. 텔레그램 연결이 끝나면 완료 상태로 전환되고 이후 신청 현황 알림을 계속 받을 수 있습니다."}
            </Callout>
          </StepCard>
        </main>

        <SummaryPanel
          name={name}
          phone={phone}
          dept={selectedDeptName}
          scope={selectedScopeLabel}
          events={selectedEventSummary}
          chatId={currentChatId}
        />
      </div>
    </div>
  );
}

function RegistrationHeader({ botUsername }: { botUsername: string }) {
  return (
    <header className="flex flex-col gap-4 pb-1 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="mb-1 text-sm font-black text-[#0b6f70]">
          장소사용신청서 알림 연결
        </p>
        <h1 className="m-0 text-[1.65rem] font-black leading-tight text-[#15201f] md:text-[2.35rem]">
          텔레그램 알림 등록
        </h1>
        <p className="mt-2 text-base leading-relaxed text-[#65706d]">
          이름, 휴대폰, 소속 부서, 알림 범위를 입력하고 텔레그램 봇을
          시작한 뒤 테스트 메시지까지 한 번에 확인합니다.
        </p>
      </div>
      <div className="inline-flex items-center gap-3 font-black text-[#084f50]">
        <span className="grid h-11 w-11 place-items-center rounded-[10px] border border-[#0b6f70]/25 bg-white shadow-[0_10px_22px_rgba(11,111,112,0.12)]">
          <Bot className="h-6 w-6" aria-hidden />
        </span>
        {botUsername
          ? `알림봇 확인됨 @${botUsername.replace(/^@/, "")}`
          : "알림봇 설정 필요"}
      </div>
    </header>
  );
}

function ProgressBar({
  profileDone,
  connectDone,
  completeDone,
}: {
  profileDone: boolean;
  connectDone: boolean;
  completeDone: boolean;
}) {
  const steps = [
    { key: "profile", label: "본인 정보", done: profileDone },
    { key: "scope", label: "알림 범위", done: profileDone },
    { key: "connect", label: "텔레그램", done: connectDone },
    { key: "test", label: "테스트", done: completeDone },
    { key: "done", label: "완료", done: completeDone },
  ];

  return (
    <div className="grid border-b border-[#ded9cd] bg-[#f0eee6] md:grid-cols-5">
      {steps.map((step, index) => (
        <div
          key={step.key}
          className={cn(
            "flex min-h-[60px] items-center justify-center gap-2 border-[#ded9cd] text-sm font-black",
            index > 0 && "border-t md:border-l md:border-t-0",
            step.done ? "text-[#084f50]" : "text-[#65706d]",
          )}
        >
          <span
            className={cn(
              "grid h-[26px] w-[26px] place-items-center rounded-full border text-xs",
              step.done
                ? "border-[#0b6f70] bg-[#0b6f70] text-white"
                : "border-[#c9c1b2] bg-white text-[#8a928f]",
            )}
          >
            {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </span>
          {step.label}
        </div>
      ))}
    </div>
  );
}

function StepCard({
  number,
  title,
  children,
  last = false,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={cn(
        "grid gap-4 p-5 md:grid-cols-[72px_minmax(0,1fr)] md:p-7",
        !last && "border-b border-[#ded9cd]",
      )}
    >
      <div className="grid h-[54px] w-[54px] place-items-center rounded-[14px] border border-[#ded9cd] bg-white text-xl font-black text-[#0b6f70]">
        {number}
      </div>
      <div className="min-w-0">
        <h2 className="mb-2 text-xl font-black leading-tight text-[#1f2726]">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function FieldBlock({
  label,
  hint,
  full = false,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5", full && "md:col-span-2")}>
      <span className="flex items-center justify-between gap-2 font-black text-[#26312f]">
        {label}
        {hint && <span className="text-xs font-bold text-[#8a928f]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function EventChoicePanel({
  selectedEventIds,
  onToggle,
}: {
  selectedEventIds: EventChoiceId[];
  onToggle: (eventId: EventChoiceId) => void;
}) {
  return (
    <div className="grid gap-2 md:col-span-2">
      <div className="font-black text-[#26312f]">이벤트 알림</div>
      <div className="grid gap-2 md:grid-cols-2">
        {EVENT_OPTIONS.map((option) => {
          const checked = selectedEventIds.includes(option.id);
          return (
            <label
              key={option.id}
              className={cn(
                "flex min-h-[72px] cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 transition",
                checked
                  ? "border-[#0b6f70] ring-4 ring-[#0b6f70]/10"
                  : "border-[#c9c1b2] hover:border-[#0b6f70]/55",
              )}
            >
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#0b6f70]"
                checked={checked}
                onChange={() => onToggle(option.id)}
              />
              <span className="min-w-0">
                <span className="block font-black text-[#1f2726]">
                  {option.label}
                </span>
                <span className="block text-sm font-bold text-[#65706d]">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full px-4 font-black transition",
        active
          ? "bg-white text-[#084f50] shadow-[0_4px_14px_rgba(31,39,38,0.08)]"
          : "text-[#65706d] hover:bg-white/50",
      )}
    >
      {children}
    </button>
  );
}

function AutoFlow({
  link,
  onAutoConnect,
  pending,
  disabled,
  autoEnabled,
}: {
  link: { deepLinkUrl: string; token: string; expiresAt: string } | null;
  onAutoConnect: () => void;
  pending: boolean;
  disabled: boolean;
  autoEnabled: boolean;
}) {
  if (!link) {
    return (
      <div>
        <Callout tone="info">
          사이트가 등록 정보를 임시 저장하고 텔레그램 연결 링크를 만듭니다.
          텔레그램 앱에서 Start를 누르면 n8n이 대화 정보를 받아 등록을
          완료합니다.
        </Callout>
        {!autoEnabled && (
          <Callout tone="warn">
            현재 교회 알림봇 주소가 설정되지 않아 연결 링크를 만들 수
            없습니다. 운영자가 알림봇 주소 설정을 완료하면 이 버튼이
            활성화됩니다.
          </Callout>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton
            type="button"
            onClick={onAutoConnect}
            disabled={pending || disabled}
          >
            <LinkIcon className="h-5 w-5" aria-hidden />
            {pending ? "준비 중..." : "텔레그램 등록 링크 만들기"}
          </PrimaryButton>
          <span className="text-sm font-bold text-[#8a928f]">
            모바일에서는 생성 후 텔레그램 앱을 바로 열면 됩니다.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 rounded-lg border border-[#b7d8d4] bg-[#f1fbf8] p-4 md:grid-cols-[170px_minmax(0,1fr)] md:items-center">
      <div className="grid min-h-[170px] place-items-center rounded-lg border border-[#c7d2ce] bg-white">
        <QrCode value={link.deepLinkUrl} size={146} />
      </div>
      <div className="min-w-0">
        <Callout tone="warn" className="mt-0">
          텔레그램 앱에서 교회 알림봇이 열리면 Start를 눌러 주세요.
          연결 링크는 10분 동안 사용할 수 있습니다.
        </Callout>
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className={cn(inputClass, "font-mono text-sm")}
            value={link.deepLinkUrl}
            readOnly
          />
          <CopyButton value={link.deepLinkUrl} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={link.deepLinkUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-black text-white transition hover:-translate-y-0.5 hover:bg-blue-700"
          >
            <ExternalLink className="h-5 w-5" aria-hidden />
            텔레그램 앱 열기
          </a>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-bold text-[#65706d]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            연결 대기 중
          </span>
        </div>
        <p className="mt-2 text-xs font-bold text-[#8a928f]">
          토큰 <code>{link.token}</code> · 만료{" "}
          {new Date(link.expiresAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function ManualFlow({
  chatId,
  onChange,
  onSubmit,
  pending,
  disabled,
}: {
  chatId: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <div>
      <Callout tone="warn">
        텔레그램 앱 검색창에서{" "}
        <a
          href="https://t.me/userinfobot"
          target="_blank"
          rel="noreferrer"
          className="font-mono font-black underline"
        >
          @userinfobot
        </a>
        을 찾아 Start를 누르면 등록에 필요한 숫자 ID를 확인할 수
        있습니다.
      </Callout>
      <div className="grid gap-3 md:grid-cols-2">
        <FieldBlock label="텔레그램 숫자 ID">
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            value={chatId}
            onChange={(e) => onChange(e.target.value)}
            placeholder="예: 123456789"
            pattern="^-?\\d+$"
          />
        </FieldBlock>
      </div>
      <div className="mt-4">
        <PrimaryButton
          type="button"
          onClick={onSubmit}
          disabled={pending || disabled || !chatId}
        >
          <Send className="h-5 w-5" aria-hidden />
          {pending ? "등록 중..." : "수동 등록하고 테스트 메시지 보내기"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function SummaryPanel({
  name,
  phone,
  dept,
  scope,
  events,
  chatId,
}: {
  name: string;
  phone: string;
  dept: string;
  scope: string;
  events: string;
  chatId: string;
}) {
  const rows = [
    ["이름", name.trim() || "미입력"],
    ["휴대폰", phone.replace(/\D/g, "").length === 11 ? phone : "미입력"],
    ["부서", dept],
    ["권한", "일반 사용자"],
    ["알림 범위", scope],
    ["이벤트", events],
    ["텔레그램", chatId],
  ];

  return (
    <aside className="rounded-lg border border-[#ded9cd] bg-[#fffdf8]/95 p-5 shadow-[0_18px_45px_rgba(31,39,38,0.09)] lg:sticky lg:top-5">
      <h2 className="mb-2 text-xl font-black text-[#1f2726]">등록 정보 요약</h2>
      <p className="text-sm font-bold text-[#8a928f]">
        입력할 때마다 실제 저장될 값을 미리 확인합니다.
      </p>
      <div className="my-4 grid gap-2">
        {rows.map(([key, value]) => (
          <div key={key} className="border-b border-[#ded9cd] pb-2 last:border-b-0">
            <div className="text-xs font-black uppercase text-[#8a928f]">
              {key}
            </div>
            <div className="break-words font-black text-[#1f2726]">{value}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function TestStatusCard({
  name,
  scope,
  events,
  telegramStatus,
  onSendTest,
  pending,
  disabled,
  result,
}: {
  name: string;
  scope: string;
  events: string;
  telegramStatus: string;
  onSendTest: () => void;
  pending: boolean;
  disabled: boolean;
  result: string | null;
}) {
  const preview = JSON.stringify(
    {
      event: "test.message",
      receiver: name.trim() || "이름 입력 전",
      scope,
      subscriptions: events,
      telegram: telegramStatus,
      message: "등록이 완료되면 교회 알림봇이 이 정보로 테스트 메시지를 보냅니다.",
    },
    null,
    2,
  );

  return (
    <div className="mt-3 rounded-lg border border-[#22302e] bg-[#17201f] p-4 text-sm leading-relaxed text-[#d7f7ef]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black text-white">테스트 메시지 준비 상태</div>
        <button
          type="button"
          onClick={onSendTest}
          disabled={pending || disabled}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 font-black text-[#17201f] transition hover:bg-[#d7f7ef] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send className="h-4 w-4" aria-hidden />
          {pending ? "전송 중..." : "테스트하기"}
        </button>
      </div>
      <pre className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-white/10 bg-[#0f1716] p-4 font-mono text-[0.82rem] leading-relaxed text-[#d7f7ef]">
        <code>{preview}</code>
      </pre>
      {result && <p className="mt-2 font-black text-white">{result}</p>}
    </div>
  );
}

function Callout({
  tone,
  className,
  children,
}: {
  tone: "info" | "warn" | "ok" | "error";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "my-4 rounded-lg border p-3.5 text-sm leading-relaxed",
        tone === "info" && "border-[#a7d8d3] bg-[#e3f2ef] text-[#084f50]",
        tone === "warn" && "border-[#f5c879] bg-[#fff3d7] text-[#713f12]",
        tone === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-900",
        tone === "error" && "border-red-300 bg-red-50 text-red-800",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-lg bg-[#0b6f70] px-4 font-black text-white transition hover:-translate-y-0.5 hover:bg-[#084f50] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function QrCode({ value, size }: { value: string; size: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    value,
  )}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="텔레그램 봇 QR"
      width={size}
      height={size}
      className="rounded-md bg-white"
    />
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* 클립보드 권한 거부 — 사용자가 수동 복사 */
        }
      }}
      className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-lg border border-[#c9c1b2] bg-white px-4 font-black text-[#1f2726] transition hover:bg-[#f6f3ec]"
    >
      <Copy className="h-4 w-4" aria-hidden />
      {copied ? "복사됨" : "복사"}
    </button>
  );
}
