"use client";

import { useState, useTransition } from "react";
import type { AppUser } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { createAdmin, deleteAdmin, issueAdminPin } from "./actions";

type Props = {
  initialAdmins: AppUser[];
};

export function AdminsAdmin({ initialAdmins }: Props) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [pending, startTransition] = useTransition();
  const [issuedPin, setIssuedPin] = useState<{ userId: string; pin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">관리자 추가</h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const form = e.currentTarget;
            startTransition(async () => {
              const res = await createAdmin(fd);
              if (res.error) setError(res.error);
              else if (res.user) {
                setAdmins((u) => [...u, res.user!]);
                if (res.pin) {
                  setIssuedPin({ userId: res.user.id, pin: res.pin });
                }
                form.reset();
              }
            });
          }}
        >
          <Field label="이름">
            <Input name="name" required />
          </Field>
          <Field label="휴대폰">
            <Input name="phone" type="tel" required placeholder="010-0000-0000" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              추가하기
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
            마스터 PIN (휴대폰 뒷 4자리)
          </h3>
          <p className="mb-2 text-sm text-amber-800">
            본인 휴대폰 뒷 4자리가 마스터 PIN 으로 등록되었습니다. 이 화면을 벗어나면
            다시 표시되지 않으니 본인에게 직접 안내해주세요.
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
          관리자 목록 ({admins.length})
        </h2>
        <ul className="divide-y divide-stone-100">
          {admins.map((u, idx) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    관리자{idx + 1}
                  </span>
                  <span className="font-semibold">{u.name}</span>
                </div>
                <div className="text-sm text-stone-500">
                  {u.phone}
                  {u.pin_hash ? " · 마스터 PIN 등록됨" : " · PIN 미발급"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    startTransition(async () => {
                      const res = await issueAdminPin(u.id);
                      if (res.error) setError(res.error);
                      else if (res.pin) {
                        setIssuedPin({ userId: u.id, pin: res.pin });
                        setAdmins((arr) =>
                          arr.map((x) =>
                            x.id === u.id ? { ...x, pin_hash: "set" } : x,
                          ),
                        );
                      }
                    });
                  }}
                >
                  PIN 발급
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (admins.length <= 1) {
                      setError(
                        "관리자가 최소 1명은 있어야 합니다. 새 관리자를 먼저 추가해주세요.",
                      );
                      return;
                    }
                    if (!confirm(`${u.name} 관리자를 삭제할까요?`)) return;
                    startTransition(async () => {
                      const res = await deleteAdmin(u.id);
                      if (res.error) setError(res.error);
                      else setAdmins((arr) => arr.filter((x) => x.id !== u.id));
                    });
                  }}
                >
                  삭제
                </Button>
              </div>
            </li>
          ))}
          {admins.length === 0 && (
            <li className="p-8 text-center text-stone-500">
              등록된 관리자가 없습니다.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
