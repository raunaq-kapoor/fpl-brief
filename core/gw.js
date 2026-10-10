// Gameweek helpers over bootstrap-static `events`.

export const currentEvent = (events) => events.find((e) => e.is_current) ?? null;

/** The gameweek whose deadline you're planning for: FPL's `is_next`, else the first unfinished one. */
export function targetEvent(events, now = new Date()) {
  return events.find((e) => e.is_next)
    ?? events.find((e) => !e.finished && new Date(e.deadline_time) > now)
    ?? null;
}

/** "6d 20h", "3h 05m", "deadline passed" */
export function countdown(deadline, now = new Date()) {
  const ms = new Date(deadline) - now;
  if (ms <= 0) return "deadline passed";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
