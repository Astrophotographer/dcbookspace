"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { Notice } from "@/lib/supabase/types";
import { createNotice, deleteNotice, updateNotice } from "./actions";

type Props = {
  initialNotices: Notice[];
};

export function NoticesAdmin({ initialNotices }: Props) {
  const [notices, setNotices] = useState(initialNotices);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <NoticeForm
        key={editing?.id ?? "new"}
        editing={editing}
        pending={pending}
        onCancelEdit={() => setEditing(null)}
        onSubmit={(fd, form) => {
          setError(null);
          startTransition(async () => {
            if (editing) {
              const res = await updateNotice(editing.id, fd);
              if (res.error) {
                setError(res.error);
                return;
              }
              const title = String(fd.get("title") ?? "").trim();
              const body = String(fd.get("body") ?? "").trim();
              setNotices((arr) =>
                arr.map((n) =>
                  n.id === editing.id ? { ...n, title, body } : n,
                ),
              );
              setEditing(null);
            } else {
              const res = await createNotice(fd);
              if (res.error) {
                setError(res.error);
                return;
              }
              if (res.notice) {
                setNotices((arr) => [res.notice!, ...arr]);
                form.reset();
              }
            }
          });
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <h2 className="text-lg font-semibold">공지 목록 ({notices.length})</h2>
        </div>
        {notices.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {notices.map((notice) => (
              <li key={notice.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-xs text-stone-500">
                      {notice.published_at.slice(0, 10)}
                    </div>
                    <h3 className="break-words text-base font-semibold text-stone-900">
                      {notice.title}
                    </h3>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm leading-relaxed text-stone-600">
                      {notice.body}
                    </p>
                  </div>
                  <div className="flex flex-none gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(notice)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (!confirm(`"${notice.title}" 공지를 삭제할까요?`)) {
                          return;
                        }
                        setError(null);
                        startTransition(async () => {
                          const res = await deleteNotice(notice.id);
                          if (res.error) setError(res.error);
                          else
                            setNotices((arr) =>
                              arr.filter((n) => n.id !== notice.id),
                            );
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NoticeForm({
  editing,
  pending,
  onSubmit,
  onCancelEdit,
}: {
  editing: Notice | null;
  pending: boolean;
  onSubmit: (fd: FormData, form: HTMLFormElement) => void;
  onCancelEdit: () => void;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {editing ? "공지 수정" : "새 공지 작성"}
        </h2>
        {editing && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
            새 공지 작성
          </Button>
        )}
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget), e.currentTarget);
        }}
      >
        <Field label="제목">
          <Input
            name="title"
            required
            maxLength={120}
            placeholder="예: 교육관 3층 사용 안내"
            defaultValue={editing?.title ?? ""}
          />
        </Field>
        <Field label="내용">
          <Textarea
            name="body"
            required
            maxLength={5000}
            rows={8}
            placeholder="공지 내용을 입력해주세요."
            defaultValue={editing?.body ?? ""}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {editing ? (
              "저장"
            ) : (
              <>
                <Plus className="h-4 w-4" />
                등록
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
