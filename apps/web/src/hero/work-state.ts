import type { Machine, Task } from "@/data/types";

/** The hero's state word (interaction-map §0). One word, the largest text on any screen. */
export type WorkState = "ready" | "working" | "paused" | "blocked" | "done" | "fault";

/** FAULT if the machine is faulty; else by the current task's status; READY with no task. */
export function workState(machine: Pick<Machine, "health"> | null, task: Pick<Task, "status"> | null): WorkState {
  if (machine?.health === "fault") return "fault";
  switch (task?.status) {
    case "in_progress":
      return "working";
    case "paused":
      return "paused";
    case "blocked_ppe":
      return "blocked";
    case "completed":
      return "done";
    default:
      return "ready";
  }
}

/**
 * The task the hero shows: the running or paused one first, then a blocked one, then the next
 * planned task by planned_start. Completed and cancelled tasks never lead.
 */
export function currentTask<T extends Pick<Task, "status" | "planned_start">>(tasks: readonly T[]): T | null {
  const rank: Record<Task["status"], number> = { in_progress: 0, paused: 1, blocked_ppe: 2, planned: 3, completed: 9, cancelled: 9 };
  const live = tasks.filter((t) => rank[t.status] < 9);
  live.sort((a, b) => rank[a.status] - rank[b.status] || a.planned_start.localeCompare(b.planned_start));
  return live[0] ?? null;
}

/** The next planned task after the current one, for "No task started · next: Trenching 11:00". */
export function nextPlanned<T extends Pick<Task, "status" | "planned_start">>(tasks: readonly T[], current: T | null): T | null {
  return (
    tasks
      .filter((t) => t.status === "planned" && t !== current)
      .sort((a, b) => a.planned_start.localeCompare(b.planned_start))[0] ?? null
  );
}
