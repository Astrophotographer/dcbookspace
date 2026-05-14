import Link from "next/link";
import {
  BellRing,
  Bot,
  Building2,
  CheckCircle2,
  Inbox,
  Phone,
  UserRound,
  XCircle,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SetupNeeded } from "@/components/setup-needed";
import { EmptyState } from "@/components/ui/empty-state";
import { isSupabaseConfigured } from "@/lib/config";
import { formatPhone } from "@/lib/phone";
import { createServiceClient } from "@/lib/supabase/server";

type SubscriberRow = {
  id: string;
  name: string;
  phone: string;
  bot_username: string;
  scope_label: string;
  home_dept_id: string | null;
  watch_all: boolean;
  active: boolean;
  registered_by_admin: boolean;
  created_at: string;
  updated_at: string;
};

type SubscriberDeptRow = {
  subscriber_id: string;
  dept_id: string;
};

type SubscriberEventRow = {
  subscriber_id: string;
  event_type: string;
};

type DepartmentRow = {
  id: string;
  name: string;
  parent_id: string | null;
  display_order: number;
};

type TelegramSubscriberView = SubscriberRow & {
  homeDeptLabel: string;
  watchDeptLabel: string;
  eventLabels: string[];
  createdLabel: string;
};

const EVENT_LABEL: Record<string, string> = {
  "reservation.created": "일회성 접수",
  "series.created": "정기 접수",
  "reservation.step_approved": "결재 진행",
  "reservation.approved": "예약 확정",
  "reservation.rejected": "반려",
  "reservation.cancelled": "취소",
  "reservation.print_failed": "출력 실패",
};

function formatKstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function groupBySubscriber<T extends { subscriber_id: string }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.subscriber_id) ?? [];
    list.push(row);
    map.set(row.subscriber_id, list);
  }
  return map;
}

async function fetchTelegramSubscribers(): Promise<{
  rows: TelegramSubscriberView[];
  error: string | null;
}> {
  const supabase = createServiceClient();

  const [subscribersR, subscriberDeptsR, subscriberEventsR, departmentsR] =
    await Promise.all([
      supabase
        .from("telegram_subscribers")
        .select(
          "id, name, phone, bot_username, scope_label, home_dept_id, watch_all, active, registered_by_admin, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("telegram_subscriber_depts")
        .select("subscriber_id, dept_id"),
      supabase
        .from("telegram_subscriber_events")
        .select("subscriber_id, event_type"),
      supabase
        .from("departments")
        .select("id, name, parent_id, display_order")
        .order("display_order", { ascending: true }),
    ]);

  const error =
    subscribersR.error?.message ??
    subscriberDeptsR.error?.message ??
    subscriberEventsR.error?.message ??
    departmentsR.error?.message ??
    null;
  if (error) return { rows: [], error };

  const departments = ((departmentsR.data ?? []) as DepartmentRow[]).sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
  );
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const deptsBySubscriber = groupBySubscriber(
    (subscriberDeptsR.data ?? []) as SubscriberDeptRow[],
  );
  const eventsBySubscriber = groupBySubscriber(
    (subscriberEventsR.data ?? []) as SubscriberEventRow[],
  );

  const deptLabel = (id: string | null): string => {
    if (!id) return "미지정";
    const dept = departmentById.get(id);
    if (!dept) return "부서 정보 없음";
    const parent = dept.parent_id ? departmentById.get(dept.parent_id) : null;
    return parent ? `${parent.name} / ${dept.name}` : dept.name;
  };

  const rows = ((subscribersR.data ?? []) as SubscriberRow[]).map((row) => {
    const watchDeptIds = (deptsBySubscriber.get(row.id) ?? []).map(
      (d) => d.dept_id,
    );
    const eventLabels = (eventsBySubscriber.get(row.id) ?? []).map(
      (e) => EVENT_LABEL[e.event_type] ?? e.event_type,
    );

    return {
      ...row,
      homeDeptLabel: deptLabel(row.home_dept_id),
      watchDeptLabel: row.watch_all
        ? "모든 부서"
        : watchDeptIds.length > 0
          ? watchDeptIds.map(deptLabel).join(", ")
          : row.scope_label || deptLabel(row.home_dept_id),
      eventLabels: eventLabels.length > 0 ? eventLabels : ["알림 없음"],
      createdLabel: formatKstDateTime(row.created_at),
    };
  });

  return { rows, error: null };
}

export default async function AdminTelegramPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <SetupNeeded />
        </main>
      </>
    );
  }

  const { rows, error } = await fetchTelegramSubscribers();
  const activeCount = rows.filter((r) => r.active).length;
  const allDeptCount = rows.filter((r) => r.active && r.watch_all).length;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2">
              <Link
                href="/admin"
                className="text-sm font-medium text-stone-500 hover:text-stone-900"
              >
                ← 관리
              </Link>
            </div>
            <h1 className="text-2xl font-bold">텔레그램 알림봇 신청자</h1>
            <p className="mt-1 text-sm leading-relaxed text-stone-600">
              알림봇을 연결한 사람의 소속 부서, 이름, 전화번호, 신청한 부서와
              알림 내용을 확인합니다.
            </p>
          </div>
          <Link
            href="/me/telegram"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Bot className="h-4 w-4" aria-hidden />
            알림봇 신청
          </Link>
        </div>

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="전체 신청자"
            value={rows.length}
            unit="명"
            Icon={UserRound}
          />
          <SummaryCard
            label="현재 활성"
            value={activeCount}
            unit="명"
            Icon={CheckCircle2}
          />
          <SummaryCard
            label="모든 부서 알림"
            value={allDeptCount}
            unit="명"
            Icon={BellRing}
          />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-relaxed text-red-800">
            텔레그램 신청자 목록을 불러오지 못했습니다. {error}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="아직 텔레그램 알림봇 신청자가 없습니다."
            description="신청자가 연결을 마치면 이곳에 목록이 표시됩니다."
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:block">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">소속 부서</th>
                    <th className="px-4 py-3">이름 / 전화번호</th>
                    <th className="px-4 py-3">신청한 부서</th>
                    <th className="px-4 py-3">알림 내용</th>
                    <th className="px-4 py-3">신청일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.active ? "bg-white" : "bg-stone-50/70"}
                    >
                      <td className="whitespace-nowrap px-4 py-4 align-top">
                        <StatusBadge active={row.active} />
                      </td>
                      <td className="max-w-[12rem] px-4 py-4 align-top font-medium text-stone-800">
                        {row.homeDeptLabel}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-top">
                        <div className="font-semibold text-stone-900">
                          {row.name}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1 text-stone-500">
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          {formatPhone(row.phone)}
                        </div>
                      </td>
                      <td className="max-w-[14rem] px-4 py-4 align-top text-stone-700">
                        {row.watchDeptLabel}
                      </td>
                      <td className="max-w-[20rem] px-4 py-4 align-top">
                        <EventPills labels={row.eventLabels} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-top text-stone-500">
                        {row.createdLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-stone-900">
                        {row.name}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-sm text-stone-500">
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                        {formatPhone(row.phone)}
                      </div>
                    </div>
                    <StatusBadge active={row.active} />
                  </div>

                  <MobileInfo
                    icon={Building2}
                    label="소속 부서"
                    value={row.homeDeptLabel}
                  />
                  <MobileInfo
                    icon={BellRing}
                    label="신청한 부서"
                    value={row.watchDeptLabel}
                  />
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-bold text-stone-500">
                      알림 내용
                    </div>
                    <EventPills labels={row.eventLabels} />
                  </div>
                  <div className="mt-3 text-xs text-stone-500">
                    신청일 {row.createdLabel}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  Icon,
}: {
  label: string;
  value: number;
  unit: string;
  Icon: typeof UserRound;
}) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4 shadow-sm ring-1 ring-stone-200">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-stone-600">{label}</div>
        <Icon className="h-4 w-4 text-brand-600" aria-hidden />
      </div>
      <div className="mt-1 text-2xl font-bold text-stone-900">
        {value.toLocaleString()}
        <span className="ml-0.5 text-sm font-normal text-stone-500">
          {unit}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const Icon = active ? CheckCircle2 : XCircle;
  return (
    <span
      className={
        active
          ? "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800"
          : "inline-flex items-center gap-1 rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-600"
      }
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {active ? "활성" : "중지"}
    </span>
  );
}

function EventPills({ labels }: { labels: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-brand-100"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function MobileInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2">
      <div className="mb-1 flex items-center gap-1 text-xs font-bold text-stone-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="text-sm font-semibold leading-snug text-stone-800">
        {value}
      </div>
    </div>
  );
}
