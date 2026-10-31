"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveTaskOnBoard } from "@/actions/task.actions";
import { formatTaskDate, isOverdue, PriorityBadge } from "@/components/tasks/task-badges";

export type BoardStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED";
export type KanbanTask = { id: string; title: string; description: string | null; priority: TaskPriority; status: TaskStatus; assignedTo: { name: string | null; email: string } | null; dueAt: string | null; estimatedMins: number | null; position: number; team: { name: string; color: string | null } | null };

const workflow: { status: BoardStatus; label: string; dot: string }[] = [
  { status: "TODO", label: "To do", dot: "#98a2b3" }, { status: "IN_PROGRESS", label: "In progress", dot: "#2563eb" }, { status: "BLOCKED", label: "Blocked", dot: "#d24b40" }, { status: "REVIEW", label: "Review", dot: "#7251c9" }, { status: "COMPLETED", label: "Completed", dot: "#1f9d74" },
];

type BoardState = Record<BoardStatus, KanbanTask[]>;
const cloneBoard = (board: BoardState): BoardState => Object.fromEntries(workflow.map(({ status }) => [status, [...board[status]]])) as BoardState;

export function KanbanBoard({ tasks }: { tasks: KanbanTask[] }) {
  const router = useRouter();
  const [board, setBoard] = useState<BoardState>(() => Object.fromEntries(workflow.map(({ status }) => [status, tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position)])) as BoardState);
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const snapshot = useRef<BoardState | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const findStatus = (state: BoardState, id: string): BoardStatus | undefined => workflow.find(({ status }) => status === id || state[status].some((task) => task.id === id))?.status;

  function handleDragStart(event: DragStartEvent) {
    snapshot.current = cloneBoard(board);
    const status = findStatus(board, String(event.active.id));
    setActiveTask(status ? board[status].find((task) => task.id === event.active.id) || null : null);
    setNotice(null);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) return;
    setBoard((current) => {
      const activeId = String(event.active.id); const overId = String(event.over?.id);
      const from = findStatus(current, activeId); const to = findStatus(current, overId);
      if (!from || !to || from === to) return current;
      const moving = current[from].find((task) => task.id === activeId);
      if (!moving) return current;
      const next = cloneBoard(current);
      next[from] = next[from].filter((task) => task.id !== activeId);
      const overIndex = next[to].findIndex((task) => task.id === overId);
      next[to].splice(overIndex < 0 ? next[to].length : overIndex, 0, { ...moving, status: to });
      return next;
    });
  }

  async function persist(next: BoardState, original: BoardState, taskId: string, fromStatus: BoardStatus, toStatus: BoardStatus) {
    const statuses = fromStatus === toStatus ? [toStatus] : [fromStatus, toStatus];
    const result = await moveTaskOnBoard({ taskId, fromStatus, toStatus, columns: statuses.map((status) => ({ status, taskIds: next[status].map((task) => task.id) })) });
    if (!result.success) { setBoard(original); setNotice({ tone: "error", text: result.message || "Task move failed. The previous order was restored." }); return; }
    setNotice({ tone: "success", text: "Board updated." }); router.refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const original = snapshot.current; snapshot.current = null; setActiveTask(null);
    if (!event.over || !original) { if (original) setBoard(original); return; }
    const taskId = String(event.active.id); const overId = String(event.over.id);
    const fromStatus = findStatus(original, taskId); let next = board; const toStatus = findStatus(next, taskId);
    if (!fromStatus || !toStatus) { setBoard(original); return; }
    if (fromStatus === toStatus) {
      const oldIndex = next[toStatus].findIndex((task) => task.id === taskId); const newIndex = next[toStatus].findIndex((task) => task.id === overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) { next = { ...next, [toStatus]: arrayMove(next[toStatus], oldIndex, newIndex) }; setBoard(next); }
    }
    await persist(next, original, taskId, fromStatus, toStatus);
  }

  async function moveWithSelect(taskId: string, target: BoardStatus) {
    const original = cloneBoard(board); const from = findStatus(board, taskId); if (!from || from === target) return;
    const moving = board[from].find((task) => task.id === taskId); if (!moving) return;
    const next = cloneBoard(board); next[from] = next[from].filter((task) => task.id !== taskId); next[target] = [...next[target], { ...moving, status: target }]; setBoard(next); setNotice(null);
    await persist(next, original, taskId, from, target);
  }

  return <div className="min-w-0">
    {notice ? <p aria-live="polite" className={`mb-3 rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-[#f2c6c1] bg-[#fff5f4] text-[#a83931]" : "border-[#b9e7d2] bg-[#effaf5] text-[#147252]"}`}>{notice.text}</p> : null}
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => { if (snapshot.current) setBoard(snapshot.current); snapshot.current = null; setActiveTask(null); }}>
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain pb-4"><div className="grid w-max grid-cols-5 gap-4 pr-1">{workflow.map((column) => <KanbanColumn key={column.status} {...column} tasks={board[column.status]} onOpen={(id) => router.push(`/dashboard/tasks/board?task=${id}`)} onStatusChange={moveWithSelect} />)}</div></div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay onOpen={() => undefined} onStatusChange={() => Promise.resolve()} /> : null}</DragOverlay>
    </DndContext>
  </div>;
}

function KanbanColumn({ status, label, dot, tasks, onOpen, onStatusChange }: { status: BoardStatus; label: string; dot: string; tasks: KanbanTask[]; onOpen: (id: string) => void; onStatusChange: (id: string, status: BoardStatus) => Promise<void> }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: "column", status } });
  return <section ref={setNodeRef} className={`flex h-[calc(100vh-14.5rem)] min-h-[31rem] w-[19rem] flex-col rounded-2xl border p-3 transition-colors ${isOver ? "border-[#9ab8f2] bg-[#edf4ff]" : "border-[#e2e7ee] bg-[#f1f4f8]"}`}><header className="flex items-center justify-between px-1 pb-3"><div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: dot }} /><h2 className="text-sm font-semibold text-[#344054]">{label}</h2></div><span className="grid min-w-6 place-items-center rounded-full bg-white px-1.5 py-1 text-[10px] font-bold text-[#667085] shadow-sm">{tasks.length}</span></header><SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}><div className="min-h-20 flex-1 space-y-3 overflow-y-auto pr-0.5">{tasks.map((task) => <SortableTaskCard key={task.id} task={task} onOpen={onOpen} onStatusChange={onStatusChange} />)}{!tasks.length ? <div className="grid h-24 place-items-center rounded-xl border border-dashed border-[#cdd5df] text-xs text-[#98a2b3]">Drop tasks here</div> : null}</div></SortableContext></section>;
}

function SortableTaskCard({ task, onOpen, onStatusChange }: { task: KanbanTask; onOpen: (id: string) => void; onStatusChange: (id: string, status: BoardStatus) => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: "task", status: task.status } });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "opacity-30" : "opacity-100"}><TaskCard task={task} onOpen={() => onOpen(task.id)} onStatusChange={(status) => onStatusChange(task.id, status)} dragProps={{ ...attributes, ...listeners }} /></div>;
}

function TaskCard({ task, onOpen, onStatusChange, dragProps, overlay = false }: { task: KanbanTask; onOpen: () => void; onStatusChange: (status: BoardStatus) => Promise<void>; dragProps?: Record<string, unknown>; overlay?: boolean }) {
  const name = task.assignedTo?.name || task.assignedTo?.email || "Unassigned"; const initials = name === "Unassigned" ? "—" : name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <article className={`rounded-xl border border-[#e1e6ed] bg-white p-4 ${overlay ? "w-[19rem] rotate-2 shadow-2xl" : "shadow-[0_2px_8px_rgba(23,32,51,.04)]"}`}><div className="flex items-start justify-between gap-3"><button onClick={onOpen} className="text-left text-sm font-semibold leading-5 text-[#253047] hover:text-[#2563eb]">{task.title}</button><button {...dragProps} aria-label={`Move ${task.title}`} className="cursor-grab rounded p-1 text-[#98a2b3] hover:bg-[#f2f4f7] active:cursor-grabbing"><span aria-hidden="true">⠿</span></button></div>{task.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7c8799]">{task.description}</p> : null}<div className="mt-3 flex items-center justify-between gap-2"><PriorityBadge priority={task.priority} /><span className="grid size-7 place-items-center rounded-lg bg-[#eef4ff] text-[9px] font-bold text-[#2555a7]" title={name}>{initials}</span></div><div className="mt-3 flex items-center justify-between border-t border-[#edf0f4] pt-3 text-[11px]"><span className={isOverdue(task.dueAt, task.status) ? "font-semibold text-[#b42318]" : "text-[#7c8799]"}>{isOverdue(task.dueAt, task.status) ? "Overdue · " : ""}{formatTaskDate(task.dueAt)}</span><span className="text-[#98a2b3]">{task.estimatedMins ? `${task.estimatedMins / 60}h` : "No estimate"}</span></div><label className="mt-3 block"><span className="sr-only">Move task status</span><select value={task.status} onChange={(event) => onStatusChange(event.target.value as BoardStatus)} onPointerDown={(event) => event.stopPropagation()} className="h-8 w-full rounded-lg border border-[#dfe4eb] bg-[#fafbfc] px-2 text-[11px] font-semibold text-[#536071] outline-none"><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="REVIEW">Review</option><option value="COMPLETED">Completed</option></select></label></article>;
}
