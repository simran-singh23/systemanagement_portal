export type TimeInterval = { startedAt: Date; endedAt: Date | null };

export function intervalMilliseconds(interval: TimeInterval, now = new Date(), boundary?: TimeInterval) {
  const rawEnd = interval.endedAt ?? now;
  const start = boundary ? new Date(Math.max(interval.startedAt.getTime(), boundary.startedAt.getTime())) : interval.startedAt;
  const boundaryEnd = boundary ? (boundary.endedAt ?? now) : rawEnd;
  const end = new Date(Math.min(rawEnd.getTime(), boundaryEnd.getTime(), now.getTime()));
  return Math.max(0, end.getTime() - start.getTime());
}

export function unionMilliseconds(intervals: TimeInterval[], now = new Date(), boundary?: TimeInterval) {
  const normalized = intervals.map((interval) => {
    const rawEnd = interval.endedAt ?? now;
    const start = Math.max(interval.startedAt.getTime(), boundary?.startedAt.getTime() ?? -Infinity);
    const end = Math.min(rawEnd.getTime(), boundary?.endedAt?.getTime() ?? now.getTime(), now.getTime());
    return { start, end };
  }).filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
  if (!normalized.length) return 0;
  let total = 0;
  let start = normalized[0].start;
  let end = normalized[0].end;
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current.start <= end) end = Math.max(end, current.end);
    else { total += end - start; start = current.start; end = current.end; }
  }
  return total + end - start;
}

export function workingSummary({ attendance, breaks, tasks, now = new Date() }: { attendance: TimeInterval | null; breaks: TimeInterval[]; tasks: TimeInterval[]; now?: Date }) {
  if (!attendance) return { officeMs: 0, breakMs: 0, netMs: 0, taskMs: 0, unallocatedMs: 0 };
  const officeMs = intervalMilliseconds(attendance, now);
  const breakMs = unionMilliseconds(breaks, now, attendance);
  const taskMs = unionMilliseconds(tasks, now, attendance);
  const netMs = Math.max(0, officeMs - breakMs);
  return { officeMs, breakMs, netMs, taskMs, unallocatedMs: Math.max(0, netMs - taskMs) };
}

export function formatMilliseconds(milliseconds: number, withSeconds = false) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return withSeconds ? `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s` : `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
