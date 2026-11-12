import { replayScenario } from "@cat/shared/fixtures";
import type { ReplayScenario } from "@cat/shared";

/**
 * The demo's recording moves. The shared `replayScenario` keeps a one-fix track on purpose (it is the
 * sparse-data case other tests pin); the fixture adapter serves this richer re-enactment so the
 * Debrief readouts (speed, pitch, seatbelt, wind) visibly follow playback: belt on at the start, off
 * from 0:40, speed and pitch building to the flag at 0:52, then the machine stopped.
 */
const pt = (t_ms: number, lat: number, lon: number) => ({ t_ms, lat, lon });

export const demoReenactment: ReplayScenario["reenactment"] = {
  ...replayScenario.reenactment,
  machine_track: [
    { ...pt(0, 21.1463, 79.0882), speed_kmh: 2.1, pitch_deg: 4.5, seatbelt_fastened: true },
    { ...pt(30000, 21.14635, 79.08828), speed_kmh: 4.3, pitch_deg: 9.8, seatbelt_fastened: true },
    { ...pt(40000, 21.1464, 79.08836), speed_kmh: 5.1, pitch_deg: 13.2, seatbelt_fastened: false },
    { ...pt(52000, 21.14646, 79.08844), speed_kmh: 6.2, pitch_deg: 17.4, seatbelt_fastened: false },
    { ...pt(120000, 21.1465, 79.0885), speed_kmh: 0, pitch_deg: 3, seatbelt_fastened: false },
  ],
  wind: [
    { t_ms: 0, from_deg: 250, kmh: 12 },
    { t_ms: 60000, from_deg: 262, kmh: 15 },
    { t_ms: 120000, from_deg: 270, kmh: 18 },
  ],
};

export const demoReplayScenario = { ...replayScenario, reenactment: demoReenactment } as ReplayScenario;
