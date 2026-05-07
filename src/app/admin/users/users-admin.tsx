"use client";

import { useMemo, useState, useTransition } from "react";
import type { AppUser, Department, UserRole } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { formatPhone } from "@/lib/phone";
import {
  createUser,
  deleteUser,
  issuePin,
  setTelegramChatId,
} from "./actions";
import { Send } from "lucide-react";

const APPROVER_ROLES: UserRole[] = ["dept_head", "elder", "manager", "senior_pastor"];
// 관리자(admin) 는 /admin/admins 별도 페이지에서 관리한다.
const ALL_ROLES: UserRole[] = [
  "applicant",
  "dept_head",
  "elder",
  "manager",
  "senior_pastor",
];

type Props = {
  initialUsers: AppUser[];
  departments: Department[];
  roleLabels: Record<UserRole, string>;
};

export function UsersAdmin({
  initialUsers,
  departments,
  roleLabels,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [pending, startTransition] = useTransition();
  const [issuedPin, setIssuedPin] = useState<{ userId: string; pin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 부서 cascading. 신청 폼과 동일 정책 — leaf 만 dept_id 로.
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
  const [deptGroupId, setDeptGroupId] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const [phone, setPhone] = useState("");
  const visibleDeptLeaves = deptGroupId
    ? deptLeavesByGroup.get(deptGroupId) ?? []
    : [];

  const isApprover = (r: UserRole) => APPROVER_ROLES.includes(r);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">새 사용자 추가</h2>
        <form
          className="grid gap-3 sm:grid-cols-2 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const form = e.currentTarget;
            const fd = new FormData(form);
            // cascading 두 셀렉트의 leaf 값을 dept_id 로 전달
            fd.set("dept_id", deptId);
            startTransition(async () => {
              const res = await createUser(fd);
              if (res.error) setError(res.error);
              else if (res.user) {
                setUsers((u) => [res.user!, ...u]);
                if (res.pin) {
                  setIssuedPin({ userId: res.user.id, pin: res.pin });
                }
                form.reset();
                setDeptGroupId("");
                setDeptId("");
                setPhone("");
              }
            });
          }}
        >
          <Field label="이름">
            <Input name="name" required />
          </Field>
          <Field label="휴대폰">
            <Input
              name="phone"
              type="tel"
              inputMode="numeric"
              required
              placeholder="010-0000-0000"
              pattern="[0-9\-]{9,13}"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value, phone))}
            />
          </Field>
          <Field label="역할">
            <Select name="role" required defaultValue="applicant">
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="부서 분류 (선택)">
            <Select
              value={deptGroupId}
              onChange={(e) => {
                setDeptGroupId(e.target.value);
                setDeptId("");
              }}
              aria-label="부서 분류"
            >
              <option value="">없음</option>
              {deptGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="부서 (선택)">
            <Select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              aria-label="소속 부서"
              disabled={!deptGroupId}
            >
              <option value="">{deptGroupId ? "없음" : "분류 먼저"}</option>
              {visibleDeptLeaves.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 md:col-span-5">
            <Button type="submit" disabled={pending}>
              추가
            </Button>
          </div>
        </form>
        {error && (
          <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs text-sky-700 hover:text-sky-900"
            aria-label="알림 닫기"
          >
            닫기
          </button>
        </div>
      )}

      {issuedPin && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5">
          <h3 className="mb-2 text-base font-semibold text-amber-900">
            초기 PIN (휴대폰 뒷 4자리)
          </h3>
          <p className="mb-2 text-sm text-amber-800">
            본인 휴대폰 뒷 4자리가 PIN으로 등록되었습니다. 첫 결재 시 변경하도록
            안내해주세요.
          </p>
          <div className="rounded bg-white p-3 text-center font-mono text-3xl tracking-widest text-stone-900">
            {issuedPin.pin}
          </div>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => setIssuedPin(null)}
          >
            확인
          </Button>
        </div>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 p-5 text-lg font-semibold">
          사용자 목록 ({users.length})
        </h2>
        <ul className="divide-y divide-stone-100">
          {users.map((u) => {
            const dept = departments.find((d) => d.id === u.dept_id);
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{u.name}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">
                      {roleLabels[u.role]}
                    </span>
                    {dept && (
                      <span className="text-sm text-stone-500">
                        · {dept.name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-stone-500">
                    {u.phone} {u.pin_hash ? "· PIN 등록됨" : ""}
                    {u.telegram_chat_id && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                        <Send className="h-3 w-3" aria-hidden />
                        텔레그램
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {isApprover(u.role) && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          // 단순 prompt 로 chat_id 입력. 빈 값은 unset.
                          const current = u.telegram_chat_id ?? "";
                          const next = window.prompt(
                            `${u.name} 님의 텔레그램 chat_id\n(비우면 등록 해제)`,
                            current,
                          );
                          if (next === null) return; // 취소
                          startTransition(async () => {
                            const res = await setTelegramChatId(
                              u.id,
                              next,
                            );
                            if (res.error) setError(res.error);
                            else {
                              const trimmed = next.trim();
                              setUsers((arr) =>
                                arr.map((x) =>
                                  x.id === u.id
                                    ? {
                                        ...x,
                                        telegram_chat_id:
                                          trimmed === "" ? null : trimmed,
                                      }
                                    : x,
                                ),
                              );
                              setNotice(
                                trimmed === ""
                                  ? `${u.name} 님의 텔레그램 등록을 해제했습니다.`
                                  : `${u.name} 님의 텔레그램 chat_id 가 등록됐습니다.`,
                              );
                            }
                          });
                        }}
                      >
                        <Send className="h-4 w-4" aria-hidden />
                        텔레그램
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await issuePin(u.id);
                            if (res.error) setError(res.error);
                            else if (res.pin) {
                              setIssuedPin({ userId: u.id, pin: res.pin });
                              setUsers((arr) =>
                                arr.map((x) =>
                                  x.id === u.id
                                    ? { ...x, pin_hash: "set" }
                                    : x,
                                ),
                              );
                            }
                          });
                        }}
                      >
                        PIN 발급
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        !confirm(
                          `${u.name} 님을 삭제할까요?\n신청 이력이 있으면 비활성화로 처리되어 PIN이 즉시 무효화됩니다.`,
                        )
                      )
                        return;
                      setError(null);
                      setNotice(null);
                      startTransition(async () => {
                        const res = await deleteUser(u.id);
                        if (res.error) {
                          setError(res.error);
                          return;
                        }
                        setUsers((arr) => arr.filter((x) => x.id !== u.id));
                        setNotice(
                          res.result === "deactivated"
                            ? `${u.name} 님은 신청 이력이 있어 비활성화 처리되었습니다. 결재 라인에서 제외되고 PIN도 무효화됩니다.`
                            : `${u.name} 님이 삭제되었습니다.`,
                        );
                      });
                    }}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            );
          })}
          {users.length === 0 && (
            <li className="p-8 text-center text-stone-500">
              등록된 사용자가 없습니다.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
