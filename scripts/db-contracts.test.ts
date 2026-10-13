/**
 * B4 contract ↔ database parity (api-contracts §9): the seeded `event_types` and `alert_policies` rows must
 * equal the TS registry, and `my_snapshot()` must parse as `MySnapshotOut`. Needs the project (`.env`);
 * everything runs inside one rolled-back transaction. Skipped when no connection is configured.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { ALERT_POLICIES, EVENT_REGISTRY, MySnapshotOut } from "../packages/shared/src/index.ts";
import { poolerUrl } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";

const env = loadEnv();
const enabled = Boolean(env.CONNECTION_STRING && env.SUPABASE_DB_PASSWORD);
const sql = enabled ? postgres(poolerUrl(env), { max: 1, prepare: false, onnotice: () => {} }) : null;

describe.skipIf(!enabled)("database ↔ contracts", () => {
  afterAll(async () => { await sql?.end(); });

  it("event_types equals EVENT_REGISTRY (type, tier, ledger, alert kind, audiences, lesson, replay)", async () => {
    const rows = await sql!`select type, default_tier, ledger, raises_alert, alert_kind, audiences, lesson_code, replay from public.event_types order by type`;
    const fromDb = Object.fromEntries(rows.map((r) => [r.type, {
      tier: r.default_tier, ledger: r.ledger, alert_kind: r.alert_kind, audiences: r.audiences, lesson_code: r.lesson_code, replay: r.replay, raises_alert: r.raises_alert,
    }]));
    const fromTs = Object.fromEntries(Object.entries(EVENT_REGISTRY).map(([type, m]) => [type, {
      tier: m.tier, ledger: m.ledger, alert_kind: m.alert_kind, audiences: [...m.audiences], lesson_code: m.lesson_code, replay: m.replay, raises_alert: m.alert_kind !== null,
    }]));
    expect(fromDb).toEqual(fromTs);
  });

  it("alert_policies equals ALERT_POLICIES", async () => {
    const rows = await sql!`select kind, hazard_group, tier_default, tier_max, dedupe_window_s, ack_timeout_s, notify_now, escalate_to, rate_capped, needs_ack from public.alert_policies order by kind`;
    const fromDb = Object.fromEntries(rows.map((r) => [r.kind, { hazard_group: r.hazard_group, tier_default: r.tier_default, tier_max: r.tier_max,
      dedupe_window_s: r.dedupe_window_s, ack_timeout_s: r.ack_timeout_s, notify_now: r.notify_now, escalate_to: r.escalate_to, rate_capped: r.rate_capped, needs_ack: r.needs_ack }]));
    const fromTs = Object.fromEntries(Object.entries(ALERT_POLICIES).map(([kind, p]) => [kind, { ...p, notify_now: [...p.notify_now], escalate_to: [...p.escalate_to], needs_ack: p.ack_timeout_s !== null }]));
    expect(fromDb).toEqual(fromTs);
  });

  it("my_snapshot() for a seeded operator parses as MySnapshotOut", async () => {
    let parsed: unknown;
    await sql!.begin(async (tx) => {
      const [ids] = await tx`select gen_random_uuid() site, gen_random_uuid() op, gen_random_uuid() usr, gen_random_uuid() machine, gen_random_uuid() scenario, gen_random_uuid() run`;
      await tx`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${ids.usr}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vitest@sqltest.local', '', now(), '{}', '{}', now(), now())`;
      await tx`insert into public.sites (id, code, name, site_type, location) values (${ids.site}, 'VITEST', 'vitest site', 'quarry', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)`;
      await tx`insert into public.operators (id, employee_code, display_name, skill_level, site_id, pseudonym) values (${ids.op}, 'OP-V001', 'Vitest', 'novice', ${ids.site}, 'Operator-V01')`;
      await tx`insert into public.profiles (user_id, role, operator_id, site_id, display_name, language) values (${ids.usr}, 'operator', ${ids.op}, ${ids.site}, 'Vitest', 'hi')`;
      await tx`insert into public.machines (id, code, home_site_id) values (${ids.machine}, 'EXC-V01', ${ids.site})`;
      await tx`insert into public.scenarios (id, code, seed, site_id, shift_start_sim, duration, generator_version) values (${ids.scenario}, 'vitest', 1, ${ids.site}, now(), interval '8 hours', 'test')`;
      await tx`insert into public.scenario_runs (id, scenario_id, sim_anchor, is_current, status, speed) values (${ids.run}, ${ids.scenario}, now(), true, 'playing', 10)`;
      await tx`insert into public.operator_pairings (run_id, operator_id, machine_id) values (${ids.run}, ${ids.op}, ${ids.machine})`;
      await tx`insert into public.tasks (run_id, operator_id, machine_id, site_id, task_type, planned_start, planned_cycles, eta_p50_min, eta_p90_min, eta_factors)
        values (${ids.run}, ${ids.op}, ${ids.machine}, ${ids.site}, 'excavation', now(), 120, 52, 61, '[{"key":"weather:hot","multiplier":1.11,"assumed":false}]')`;
      await tx`insert into public.machine_state (run_id, machine_id, ts, speed_kmh, moving, location) values (${ids.run}, ${ids.machine}, now(), 6.2, true, extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)`;
      await tx`insert into public.operator_state (run_id, operator_id, ts, on_foot, ppe, location) values (${ids.run}, ${ids.op}, now(), false, '{"helmet": true}', extensions.ST_SetSRID(extensions.ST_MakePoint(79.0882, 21.1463), 4326)::extensions.geography)`;
      await tx`insert into public.weather_snapshots (site_id, run_id, ts, temperature_c, wind_kmh, wbgt_c) values (${ids.site}, ${ids.run}, now(), 38.5, 12, 31.2)`;
      await tx`select private.emit_event('safety.seatbelt_breach', '{"frame_seq": 1, "speed_kmh": 6.2, "pitch_deg": 17.4, "roll_deg": 2, "slope_limit_deg": 15, "zone_id": null}', ${"det:" + ids.run + ":EXC-V01:seatbelt_off_moving:1"}, 'detector.rule', ${ids.site}, ${ids.run}, ${ids.machine}, ${ids.op})`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ids.usr, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      const [row] = await tx`select public.my_snapshot() as snap`;
      parsed = row.snap;
      throw new Error("rollback");
    }).catch((e) => { if ((e as Error).message !== "rollback") throw e; });
    const result = MySnapshotOut.safeParse(parsed);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    if (result.success) {
      expect(result.data.paired_machine_id).not.toBeNull();
      expect(result.data.recent_events[0].type).toBe("safety.seatbelt_breach");
      expect(result.data.operator_state?.motion_locked).toBe(true);
    }
  });
});
