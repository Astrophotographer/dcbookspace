"use client";

import { useMemo, useState, useTransition } from "react";
import { GripVertical, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { AppUser, Department } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import {
  clearDeptElder,
  clearDeptHead,
  createDepartment,
  deleteDepartment,
  renameDepartment,
  reorderLeaves,
  setDeptElder,
  setDeptHead,
} from "./actions";

type Props = {
  initialDepartments: Department[];
  initialContacts: AppUser[];
};

type ContactSlot = "head" | "elder";

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

  // 좌측 사이드바에서 선택된 그룹. null 이면 첫 그룹 자동 선택.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // 좌측 하단 "그룹 추가" 인라인 입력 토글
  const [groupDraft, setGroupDraft] = useState<string | null>(null);

  // 드래그 앤 드롭 상태 (같은 그룹 안 leaf 순서 변경)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  // leaf 순서 이동 — 낙관적 업데이트 후 서버 반영
  const moveLeaf = (
    groupId: string,
    fromId: string,
    toId: string,
    position: "before" | "after",
  ) => {
    if (fromId === toId) return;
    const sib = depts
      .filter((d) => d.parent_id === groupId)
      .sort((a, b) => a.display_order - b.display_order);
    const moved = sib.find((d) => d.id === fromId);
    if (!moved) return;
    const without = sib.filter((d) => d.id !== fromId);
    let insertAt = without.findIndex((d) => d.id === toId);
    if (insertAt === -1) return;
    if (position === "after") insertAt += 1;
    const reordered = [
      ...without.slice(0, insertAt),
      moved,
      ...without.slice(insertAt),
    ];
    const orderedIds = reordered.map((d) => d.id);
    const renumbered = reordered.map((d, i) => ({ ...d, display_order: i }));

    // 낙관적 업데이트
    setDepts((prev) => {
      const others = prev.filter((d) => d.parent_id !== groupId);
      return [...others, ...renumbered];
    });
    setError(null);
    startTransition(async () => {
      const res = await reorderLeaves(groupId, orderedIds);
      if (res.error) setError(res.error);
    });
  };

  const findUser = (id: string | null) =>
    id ? contacts.find((u) => u.id === id) ?? null : null;

  const groups = useMemo(
    () =>
      [...depts]
        .filter((d) => d.parent_id === null)
        .sort((a, b) => a.display_order - b.display_order),
    [depts],
  );

  const leavesByParent = useMemo(() => {
    const map = new Map<string, Department[]>();
    for (const d of depts) {
      if (d.parent_id) {
        const arr = map.get(d.parent_id) ?? [];
        arr.push(d);
        map.set(d.parent_id, arr);
      }
    }
    for (const arr of map.values())
      arr.sort((a, b) => a.display_order - b.display_order);
    return map;
  }, [depts]);

  // 사용자가 한 번도 선택 안 했을 때 첫 그룹을 derived 로 사용 (effect 없이)
  const activeGroupId =
    selectedGroupId && groups.some((g) => g.id === selectedGroupId)
      ? selectedGroupId
      : groups[0]?.id ?? null;

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const leaves = activeGroupId
    ? leavesByParent.get(activeGroupId) ?? []
    : [];

  return (
    <div className="space-y-4">
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* 좌측 그룹 탭 */}
        <aside className="rounded-2xl border border-stone-200 bg-white shadow-sm lg:sticky lg:top-4 lg:w-64 lg:flex-none">
          <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700">
            그룹 ({groups.length})
          </div>

          {/* 모바일: 가로 스크롤 pills, 데스크톱: 세로 리스트 */}
          <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
            {groups.map((g) => {
              const count = leavesByParent.get(g.id)?.length ?? 0;
              const active = g.id === activeGroupId;
              return (
                <li key={g.id} className="flex-none lg:flex-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-200"
                        : "text-stone-700 hover:bg-stone-50",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="truncate">{g.name}</span>
                    <span
                      className={cn(
                        "flex-none rounded-full px-2 py-0.5 text-xs",
                        active
                          ? "bg-brand-100 text-brand-700"
                          : "bg-stone-100 text-stone-600",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 그룹 추가 */}
          <div className="border-t border-stone-200 p-2">
            {groupDraft === null ? (
              <button
                type="button"
                onClick={() => setGroupDraft("")}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50"
              >
                <Plus className="h-4 w-4" />
                그룹 추가
              </button>
            ) : (
              <form
                className="space-y-2 px-1 py-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = groupDraft.trim();
                  if (!name) {
                    setGroupDraft(null);
                    return;
                  }
                  setError(null);
                  const fd = new FormData();
                  fd.set("name", name);
                  fd.set("parent_id", "");
                  startTransition(async () => {
                    const res = await createDepartment(fd);
                    if (res.error) setError(res.error);
                    else if (res.dept) {
                      setDepts((arr) => [...arr, res.dept!]);
                      setSelectedGroupId(res.dept.id);
                      setGroupDraft(null);
                    }
                  });
                }}
              >
                <Input
                  autoFocus
                  value={groupDraft}
                  onChange={(e) => setGroupDraft(e.target.value)}
                  placeholder="새 그룹 이름"
                />
                <div className="flex gap-1">
                  <Button type="submit" size="sm" disabled={pending}>
                    추가
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setGroupDraft(null)}
                  >
                    취소
                  </Button>
                </div>
              </form>
            )}
          </div>
        </aside>

        {/* 우측 메인 패널 */}
        <section className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white shadow-sm">
          {!activeGroup ? (
            <div className="p-12 text-center text-stone-500">
              그룹이 없습니다. 좌측에서 그룹부터 추가해 주세요.
            </div>
          ) : (
            <>
              <GroupHeaderBar
                dept={activeGroup}
                childCount={leaves.length}
                pending={pending}
                onRename={(name) => {
                  setError(null);
                  startTransition(async () => {
                    const res = await renameDepartment(activeGroup.id, name);
                    if (res.error) setError(res.error);
                    else
                      setDepts((arr) =>
                        arr.map((x) =>
                          x.id === activeGroup.id ? { ...x, name } : x,
                        ),
                      );
                  });
                }}
                onDelete={() => {
                  if (leaves.length > 0) {
                    setError(
                      `"${activeGroup.name}" 그룹에 소분류가 ${leaves.length}개 남아있어 삭제할 수 없어요. 먼저 정리해주세요.`,
                    );
                    return;
                  }
                  if (!confirm(`"${activeGroup.name}" 그룹을 삭제할까요?`))
                    return;
                  setError(null);
                  startTransition(async () => {
                    const res = await deleteDepartment(activeGroup.id);
                    if (res.error) setError(res.error);
                    else {
                      setDepts((arr) =>
                        arr.filter((x) => x.id !== activeGroup.id),
                      );
                      setSelectedGroupId(null);
                    }
                  });
                }}
              />

              <LeafAddForm
                groupId={activeGroup.id}
                pending={pending}
                onSubmit={(fd) => {
                  setError(null);
                  startTransition(async () => {
                    const res = await createDepartment(fd);
                    if (res.error) setError(res.error);
                    else if (res.dept) {
                      setDepts((arr) => [...arr, res.dept!]);
                    }
                  });
                }}
              />

              <ul className="divide-y divide-stone-100">
                {leaves.length === 0 ? (
                  <li className="p-8 text-center text-sm text-stone-500">
                    소속 부서가 없습니다. 위에서 추가해 주세요.
                  </li>
                ) : (
                  leaves.map((d) => {
                    const head = findUser(d.dept_head_id);
                    const elder = findUser(d.elder_id);
                    const isDragging = draggedId === d.id;
                    const overBefore =
                      dragOver?.id === d.id && dragOver.position === "before";
                    const overAfter =
                      dragOver?.id === d.id && dragOver.position === "after";
                    return (
                      <li
                        key={d.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedId(d.id);
                          e.dataTransfer.effectAllowed = "move";
                          // 일부 브라우저에서 dataTransfer 비면 drag 시작 안 됨
                          e.dataTransfer.setData("text/plain", d.id);
                        }}
                        onDragOver={(e) => {
                          if (!draggedId || draggedId === d.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          const rect =
                            e.currentTarget.getBoundingClientRect();
                          const mid = rect.top + rect.height / 2;
                          const position: "before" | "after" =
                            e.clientY < mid ? "before" : "after";
                          if (
                            dragOver?.id !== d.id ||
                            dragOver.position !== position
                          ) {
                            setDragOver({ id: d.id, position });
                          }
                        }}
                        onDragLeave={(e) => {
                          // 자식 element 진입은 무시
                          if (
                            e.currentTarget.contains(
                              e.relatedTarget as Node | null,
                            )
                          )
                            return;
                          if (dragOver?.id === d.id) setDragOver(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (
                            activeGroup &&
                            draggedId &&
                            draggedId !== d.id &&
                            dragOver?.id === d.id
                          ) {
                            moveLeaf(
                              activeGroup.id,
                              draggedId,
                              d.id,
                              dragOver.position,
                            );
                          }
                          setDraggedId(null);
                          setDragOver(null);
                        }}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setDragOver(null);
                        }}
                        className={cn(
                          "space-y-3 px-5 py-4 transition-colors",
                          isDragging && "opacity-40",
                          overBefore &&
                            "border-t-2 border-brand-500 -mt-px",
                          overAfter &&
                            "border-b-2 border-brand-500 -mb-px",
                        )}
                      >
                        <LeafHeader
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
                                setDepts((arr) =>
                                  arr.filter((x) => x.id !== d.id),
                                );
                            });
                          }}
                        />

                        <div className="grid gap-2 sm:grid-cols-2">
                          <ContactRow
                            label="부서장"
                            user={head}
                            open={
                              openSlot?.deptId === d.id &&
                              openSlot.slot === "head"
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
                                        ? {
                                            ...x,
                                            dept_head_id: res.user!.id,
                                          }
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
                              if (!confirm("부서장 지정을 해제할까요?"))
                                return;
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
                              openSlot?.deptId === d.id &&
                              openSlot.slot === "elder"
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
                              if (!confirm("담당장로 지정을 해제할까요?"))
                                return;
                              setError(null);
                              startTransition(async () => {
                                const res = await clearDeptElder(d.id);
                                if (res.error) setError(res.error);
                                else
                                  setDepts((arr) =>
                                    arr.map((x) =>
                                      x.id === d.id
                                        ? { ...x, elder_id: null }
                                        : x,
                                    ),
                                  );
                              });
                            }}
                          />
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function GroupHeaderBar({
  dept,
  childCount,
  pending,
  onRename,
  onDelete,
}: {
  dept: Department;
  childCount: number;
  pending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dept.name);

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50 px-5 py-3">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-48 max-w-72"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => {
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
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-stone-900">{dept.name}</h2>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
          소속 부서 {childCount}
        </span>
      </div>
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
          그룹 삭제
        </Button>
      </div>
    </div>
  );
}

function LeafAddForm({
  groupId,
  pending,
  onSubmit,
}: {
  groupId: string;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-b border-stone-200 bg-stone-50 px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const v = name.trim();
        if (!v) return;
        const fd = new FormData();
        fd.set("name", v);
        fd.set("parent_id", groupId);
        onSubmit(fd);
        setName("");
      }}
    >
      <Field label="이 그룹에 부서 추가">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 1청년회, 제 1지역"
          className="min-w-60"
        />
      </Field>
      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        <Plus className="h-4 w-4" />
        추가
      </Button>
    </form>
  );
}

function LeafHeader({
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
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex-none cursor-grab text-stone-400 active:cursor-grabbing"
          title="드래그해서 순서 바꾸기"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="font-medium text-stone-900">{dept.name}</span>
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          disabled={pending}
        >
          <Pencil className="h-3.5 w-3.5" />
          이름
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={pending}
          className="text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
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
              onChange={(e) => setPhone(formatPhone(e.target.value, phone))}
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
