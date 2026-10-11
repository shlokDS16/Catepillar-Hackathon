"use client";

import { MySnapshotOut } from "@cat/shared";
import { mySnapshot } from "@cat/shared/fixtures";
import { useState } from "react";
import { HeroCard } from "@/components/hero/hero-card";
import { MotionLock } from "@/components/hero/motion-lock";
import { Button } from "@/components/ui/button";
import { ModeProvider } from "@/data/mode";

const snap = MySnapshotOut.parse(mySnapshot);
const machine = snap.machine;
const working = snap.tasks;
const paused = [{ ...snap.tasks[0], status: "paused" as const, progress_pct: 72 }];
const blocked = [{ ...snap.tasks[0], status: "blocked_ppe" as const, progress_pct: 0 }];
const none = [{ ...snap.tasks[0], status: "planned" as const, planned_start: "2026-09-24T11:00:00.000+05:30", task_type: "trenching" as const }];
const fault = machine ? { ...machine, health: "fault" as const } : null;

/** Hero states on fixtures (screens.md §0) and the motion-lock view (interaction-map §6). */
export function KitHero() {
  const [lock, setLock] = useState(false);
  const [pct, setPct] = useState(35);
  return (
    <ModeProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-6">
          <Button onClick={() => setPct((p) => (p >= 100 ? 10 : p + 10))}>Progress +10 % (tween)</Button>
          <Button onClick={() => setLock(true)}>Show motion lock (3 s)</Button>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <HeroCard machine={machine} tasks={[{ ...working[0], progress_pct: pct }]} safety="clear" />
          <HeroCard machine={machine} tasks={paused} safety="warning" topAlert={snap.active_alerts[0]} />
          <HeroCard machine={machine} tasks={blocked} safety="caution" />
          <HeroCard machine={fault} tasks={working} safety="critical" />
          <HeroCard machine={machine} tasks={none} safety="clear" asOf="10:42" />
          <HeroCard machine={machine} tasks={working} safety="nosignal" notUpdated />
        </div>
        {lock ? (
          <div onClickCapture={() => setLock(false)}>
            <MotionLock machine={machine} tasks={working} safety="warning" topAlert={snap.active_alerts[0]} />
          </div>
        ) : null}
      </div>
    </ModeProvider>
  );
}
