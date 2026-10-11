import { describe, expect, it } from "vitest";
import { IDS } from "@cat/shared/fixtures";
import { FixtureAdapter } from "./fixture-adapter";

/** The fixture adapter is the demo's server: its beats must keep the same contract as the real one. */
describe("FixtureAdapter beats × RPCs", () => {
  it("Start is blocked before Beat 1 and starts after the vest is restored (F06-F08 review 1)", async () => {
    const adapter = new FixtureAdapter(0);
    const before = await adapter.taskStart({ p_task_id: IDS.task, p_request_id: IDS.request });
    expect(before.status).toBe("blocked");
    expect(before).toMatchObject({ status: "blocked", missing: ["vest"] });

    await adapter.playBeat(1);
    const after = await adapter.taskStart({ p_task_id: IDS.task, p_request_id: IDS.request });
    expect(after.status).toBe("started");
    await adapter.taskPause({ p_task_id: IDS.task }); // stops the progress timer (no open handle)
  });
});
