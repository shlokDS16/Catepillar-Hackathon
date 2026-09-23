import { z } from "zod";

// Offline-first write queue entry, used identically by web (IndexedDB) and mobile (expo-sqlite).
export const SyncOpSchema = z.object({
  id: z.string().uuid(),
  entity: z.string().min(1),
  entityId: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.string(), z.unknown()).nullable(),
  clientUpdatedAt: z.string().datetime(),
});

export type SyncOp = z.infer<typeof SyncOpSchema>;
