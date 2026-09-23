import type { z } from "zod";
import type {
  AlertAckIn,
  AlertAckOut,
  ConsentSetIn,
  IncidentLogIn,
  IncidentLogOut,
  LedgerExportIn,
  LedgerExportRow,
  LedgerRecomputeIn,
  LedgerRecomputeOut,
  LedgerVerifyIn,
  LedgerVerifyOut,
  LessonCompleteIn,
  LessonContent,
  PairMachineIn,
  PairMachineOut,
  PpeOverrideIn,
  PpeOverrideOut,
  ProtocolCard,
  ReplayDebriefResult,
  ReplayGetIn,
  ReplayScenario,
  ReplaySubmitIn,
  SosCancelIn,
  SosRaiseIn,
  SosRaiseOut,
  TaskCompleteIn,
  TaskPauseIn,
  TaskStartIn,
  TaskStartOut,
} from "@cat/shared";
import type { AppEvent, ClockTick, MachineDelta, Snapshot } from "@/data/types";
import type { Connectivity } from "@/data/reducer";

type In<T> = z.input<T extends z.ZodType ? T : never>;
type Out<T> = z.output<T extends z.ZodType ? T : never>;

/** What the adapter pushes to the store. Every message is one frame for the NO SIGNAL clock. */
export type PortMessage =
  | { kind: "event"; event: AppEvent }
  | { kind: "clock"; tick: ClockTick }
  | { kind: "machines"; delta: MachineDelta }
  | { kind: "connectivity"; connectivity: Connectivity };

/** RPC errors carry the contract's `RpcErrorCode` so screens can map them to copy. */
export class RpcError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * The one seam between screens and data (frontend-tasks §0 rule 4). Screens use this through the
 * store; they never import supabase-js. The FixtureAdapter answers from @cat/shared/fixtures, the
 * SupabaseAdapter (F13) from RPCs and Realtime. Argument and result shapes are the contracts'.
 */
export type DataPort = {
  snapshot(): Promise<Snapshot>;
  subscribe(onMessage: (m: PortMessage) => void): () => void;
  protocolCard(id: string): Promise<ProtocolCard | null>;

  pairMachine(input: In<typeof PairMachineIn>): Promise<Out<typeof PairMachineOut>>;
  consentSet(input: In<typeof ConsentSetIn>): Promise<void>;
  taskStart(input: In<typeof TaskStartIn>): Promise<Out<typeof TaskStartOut>>;
  taskPause(input: In<typeof TaskPauseIn>): Promise<void>;
  taskComplete(input: In<typeof TaskCompleteIn>): Promise<void>;
  alertAck(input: In<typeof AlertAckIn>): Promise<Out<typeof AlertAckOut>>;
  sosRaise(input: In<typeof SosRaiseIn>): Promise<Out<typeof SosRaiseOut>>;
  sosCancel(input: In<typeof SosCancelIn>): Promise<void>;
  incidentLog(input: In<typeof IncidentLogIn>): Promise<Out<typeof IncidentLogOut>>;

  ppeOverride(input: In<typeof PpeOverrideIn>): Promise<Out<typeof PpeOverrideOut>>;
  ledgerVerify(input: In<typeof LedgerVerifyIn>): Promise<Out<typeof LedgerVerifyOut>>;
  ledgerExport(input: In<typeof LedgerExportIn>): Promise<Out<typeof LedgerExportRow>[]>;
  ledgerRecompute(input: In<typeof LedgerRecomputeIn>): Promise<Out<typeof LedgerRecomputeOut>>;

  replayGet(input: In<typeof ReplayGetIn>): Promise<ReplayScenario>;
  replaySubmit(input: In<typeof ReplaySubmitIn>): Promise<ReplayDebriefResult>;
  lessonGet(code: string): Promise<LessonContent>;
  lessonComplete(input: In<typeof LessonCompleteIn>): Promise<void>;
};

/** One request_id per intent, reused on retry (interaction-map §3). */
export function newRequestId(): string {
  return crypto.randomUUID();
}
