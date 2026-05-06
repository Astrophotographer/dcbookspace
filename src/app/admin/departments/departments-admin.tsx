"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { AppUser, Department } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  clearDeptElder,
  clearDeptHead,
  createDepartment,
  deleteDepartment,
  renameDepartment,
  setDeptElder,
  setDeptHead,
} from "./actions";

type Props = {
  initialDepartments: Department[];
  initialContacts: AppUser[];
};

type ContactSlot = "head" | "elder";

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

export function DepartmentsAdmin({
  initialDepartments,
  initialContacts,
}: Props) {
  const [depts, setDepts] = useState(initialDepartments);
  const [contacts, setContacts] = useState(initialContacts);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openSlot, setOpenSlot] = useState<{
    deptId: string;
    slot: ContactSlot;
  } | null>(null);
  const [issuedPin, setIssuedPin] = useState<{
    name: string;
    pin: string;
  } | null>(null);

  const findUser = (id: string | null) =>
    id ? contacts.find((u) => u.id === id) ?? null : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">새 부서 추가</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const form = e.currentTarget;
            startTransition(async () => {
              const res = await createDepartment(fd);
              if (res.error) setError(res.error);
              else if (res.dept) {
                setDepts((arr) => [...arr, res.dept!]);
                form.reset();
              }
            });
          }}
        >
          <Field label="부서 이름">
            <Input
              name="name"
              required
              placeholder="예: 교육부, 찬양부"
              className="min-w-60"
            />
          </Field>
          <Button type="submit" disabled={pending}>
            <Plus className="h-4 w-4" />
            추가
          </Button>
        </form>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {issuedPin && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5">
          <h3 className="mb-2 text-base font-semibold text-amber-900">
            {issuedPin.name} 님의 초기 PIN (휴대폰 뒷 4자리)
          </h3>
          <p className="mb-2 text-sm text-amber-800">
            본인 휴대폰 뒷 4자리가 PIN으로 등록되었습니다. 첫 결재 시 변경하도록
            안내해 주세요.
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
          부서 목록 ({depts.length})
        </h2>
        {depts.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            등록된 부서가 없습니다. 위에서 추가해 주세요.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {depts.map((d) => {
              const head = findUser(d.dept_head_id);
              const elder = findUser(d.elder_id);
              return (
                <li key={d.id} className="space-y-3 p-5">
                  <DeptHeader
                    dept={d}
                    pending={pending}
                    onRename={(name) => {
                      setError(null);
                      startTransition(async () => {
                        const res = await renameDepartment(d.id, name);
                        if (res.error) setError(res.error);
                        else
                          setDepts((arr) =>
                            arr.map((x) =>
                              x.id === d.id ? { ...x, name } : x,
                            ),
                          );
                      });
                    }}
                    onDelete={() => {
                      if (
                        !confirm(
                          `"${d.name}" 부서를 삭제할까요?\n신청서 이력에 남은 부서명은 그대로 보존됩니다.`,
                        )
                      )
                        return;
                      setError(null);
                      startTransition(async () => {
                        const res = await deleteDepartment(d.id);
                        if (res.error) setError(res.error);
                        else
                          setDepts((arr) => arr.filter((x) => x.id !== d.id));
                      });
                    }}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <ContactRow
                      label="부서장"
                      user={head}
                      open={
                        openSlot?.deptId === d.id && openSlot.slot === "head"
                      }
                      pending={pending}
                      onOpen={() =>
                        setOpenSlot({ deptId: d.id, slot: "head" })
                      }
                      onCancel={() => setOpenSlot(null)}
                      onSubmit={(fd) => {
                        setError(null);
                        startTransition(async () => {
                          const res = await setDeptHead(d.id, fd);
                          if (res.error) setError(res.error);
                          else if (res.user) {
                            setContacts((arr) => [...arr, res.user!]);
                            setDepts((arr) =>
                              arr.map((x) =>
                                x.id === d.id
                                  ? { ...x, dept_head_id: res.user!.id }
                                  : x,
                              ),
                            );
                            setOpenSlot(null);
                            if (res.pin)
                              setIssuedPin({
                                name: res.user.name,
                                pin: res.pin,
                              });
                          }
                        });
                      }}
                      onClear={() => {
                        if (!confirm("부서장 지정을 해제할까요?")) return;
                        setError(null);
                        startTransition(async () => {
                          const res = await clearDeptHead(d.id);
                          if (res.error) setError(res.error);
                          else
                            setDepts((arr) =>
                              arr.map((x) =>
                                x.id === d.id
                                  ? { ...x, dept_head_id: null }
                                  : x,
                              ),
                            );
                        });
                      }}
                    />
                    <ContactRow
                      label="담당장로"
                      user={elder}
                      open={
                        openSlot?.deptId === d.id && openSlot.slot === "elder"
                      }
                      pending={pending}
                      onOpen={() =>
                        setOpenSlot({ deptId: d.id, slot: "elder" })
                      }
                      onCancel={() => setOpenSlot(null)}
                      onSubmit={(fd) => {
                        setError(null);
                        startTransition(async () => {
                          const res = await setDeptElder(d.id, fd);
                          if (res.error) setError(res.error);
                          else if (res.user) {
                            setContacts((arr) => [...arr, res.user!]);
                            setDepts((arr) =>
                              arr.map((x) =>
                                x.id === d.id
                                  ? { ...x, elder_id: res.user!.id }
                                  : x,
                              ),
                            );
                            setOpenSlot(null);
                            if (res.pin)
                              setIssuedPin({
                                name: res.user.name,
                                pin: res.pin,
                              });
                          }
                        });
                      }}
                      onClear={() => {
                        if (!confirm("담당장로 지정을 해제할까요?")) return;
                        setError(null);
                        startTransition(async () => {
                          const res = await clearDeptElder(d.id);
                          if (res.error) setError(res.error);
                          else
                            setDepts((arr) =>
                              arr.map((x) =>
                                x.id === d.id ? { ...x, elder_id: null } : x,
                              ),
                            );
                        });
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DeptHeader({
  dept,
  pending,
  onRename,
  onDelete,
}: {
  dept: Department;
  pending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dept.name);

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v || v === dept.name) {
            setEditing(false);
            setDraft(dept.name);
            return;
          }
          onRename(v);
          setEditing(false);
        }}
      >
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-48 max-w-72"
        />
        <Button type="submit" size="sm" disabled={pending}>
          저장
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setDraft(dept.name);
          }}
        >
          취소
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-lg font-semibold text-stone-900">{dept.name}</div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing(true)}
          disabled={pending}
        >
          <Pencil className="h-4 w-4" />
          이름 변경
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={pending}
          className="text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          삭제
        </Button>
      </div>
    </div>
  );
}

function ContactRow({
  label,
  user,
  open,
  pending,
  onOpen,
  onCancel,
  onSubmit,
  onClear,
}: {
  label: string;
  user: AppUser | null;
  open: boolean;
  pending: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  onClear: () => void;
}) {
  const [phone, setPhone] = useState("");

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-stone-700">{label}</span>
        {user && !open && (
          <button
            type="button"
            onClick={onClear}
            disabled={pending}
            className="text-xs text-stone-500 hover:text-red-600 disabled:opacity-50"
          >
            지정 해제
          </button>
        )}
      </div>

      {!open ? (
        user ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-stone-900">
                {user.name}
              </div>
              <div className="truncate font-mono text-sm text-stone-600">
                {user.phone ?? "(번호 없음)"}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpen}
              disabled={pending}
            >
              변경
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpen}
            disabled={pending}
          >
            <UserPlus className="h-4 w-4" />
            {label} 등록
          </Button>
        )
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit(fd);
            setPhone("");
          }}
        >
          <Field label="이름">
            <Input name="name" required placeholder={`${label} 이름`} />
          </Field>
          <Field label="휴대폰 (뒷 4자리가 초기 PIN)">
            <Input
              name="phone"
              required
              type="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              등록
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onCancel();
                setPhone("");
              }}
            >
              <X className="h-4 w-4" />
              취소
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
