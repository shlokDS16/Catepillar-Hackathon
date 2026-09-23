/** Fixed, standard-form (v4) uuids and timestamps shared by every fixture. Seed data must use the same form: `z.uuid()` rejects non-standard ids. */
export const IDS = {
  site: "11111111-1111-4111-8111-111111111111",
  operator: "22222222-2222-4222-8222-222222222222",
  machine: "33333333-3333-4333-8333-333333333333",
  event: "44444444-4444-4444-8444-444444444444",
  alert: "55555555-5555-4555-8555-555555555555",
  task: "66666666-6666-4666-8666-666666666666",
  run: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
  replay: "99999999-9999-4999-8999-999999999999",
  zone: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  assignment: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  request: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  attempt: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  dispatch: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  anomaly: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
  override: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2",
  incident: "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3",
  root: "f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4",
} as const;
export const T0 = "2026-09-24T09:40:00.000+05:30";   // sim time of the demo seatbelt breach
export const T1 = "2026-09-24T09:40:01.250+05:30";   // wall time it was recorded
export const i18n = (en: string, hi: string) => ({ en, hi });
