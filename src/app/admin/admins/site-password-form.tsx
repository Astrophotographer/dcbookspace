"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { changeSitePassword } from "./actions";

/**
 * 사이트 로그인 (BasicAuth 대체) 비밀번호 변경 폼.
 * - 현재 비밀번호 검증은 env (비상 키) 또는 DB hash 둘 중 하나로 통과
 * - 변경 성공 시 DB hash 만 갱신. env 는 그대로 — 분실 시 비상 복구 경로 보존
 */
export function SitePasswordForm({
  defaultUsername,
}: {
  defaultUsername: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        const fd = new FormData(e.currentTarget);
        const form = e.currentTarget;
        startTransition(async () => {
          const res = await changeSitePassword(fd);
          if (res.error) setError(res.error);
          else if (res.ok) {
            setSuccess(true);
            form.reset();
          }
        });
      }}
    >
      <Field label="아이디">
        <Input
          name="username"
          required
          autoComplete="username"
          defaultValue={defaultUsername}
        />
      </Field>
      <Field label="현재 비밀번호">
        <Input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="새 비밀번호" hint="4자 이상">
        <Input
          name="new_password"
          type="password"
          required
          minLength={4}
          autoComplete="new-password"
        />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input
          name="confirm_password"
          type="password"
          required
          minLength={4}
          autoComplete="new-password"
        />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-2">
          비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용해주세요.
        </div>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </div>
    </form>
  );
}
