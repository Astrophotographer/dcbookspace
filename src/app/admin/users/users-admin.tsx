"use client";

import { useState, useTransition } from "react";
import type { AppUser, Department, UserRole } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { createUser, deleteUser, issuePin } from "./actions";

const APPROVER_ROLES: UserRole[] = ["dept_head", "elder", "manager", "senior_pastor"];
const ALL_ROLES: UserRole[] = [
  "applicant",
  "dept_head",
  "elder",
  "manager",
  "senior_pastor",
  "admin",
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

  const isApprover = (r: UserRole) => APPROVER_ROLES.includes(r);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">새 사용자 추가</h2>
        <form
          className="grid gap-3 sm:grid-cols-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await createUser(fd);
              if (res.error) setError(res.error);
              else if (res.user) {
                setUsers((u) => [res.user!, ...u]);
                if (res.pin) {
                  setIssuedPin({ userId: res.user.id, pin: res.pin });
                }
                (e.target as HTMLFormElement).reset();
              }
            });
          }}
        >
          <Field label="이름">
            <Input name="name" required />
          </Field>
          <Field label="휴대폰">
            <Input name="phone" type="tel" required />
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
          <Field label="부서 (선택)">
            <Select name="dept_id">
              <option value="">없음</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 md:col-span-4">
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
                  </div>
                </div>
                <div className="flex gap-2">
                  {isApprover(u.role) && (
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
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!confirm(`${u.name} 님을 삭제할까요?`)) return;
                      startTransition(async () => {
                        const res = await deleteUser(u.id);
                        if (res.error) setError(res.error);
                        else setUsers((arr) => arr.filter((x) => x.id !== u.id));
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
