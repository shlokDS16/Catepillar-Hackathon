import { describe, expect, it } from "vitest";
import { anyAssumed, provenanceKind, provenanceOf } from "./provenance";

describe("provenanceOf (api-contracts §11 UI rule)", () => {
  it("assumed sensors get an 'assumed' chip", () => {
    expect(provenanceOf("machine_state", "speed_kmh")).toEqual({ kind: "assumed" });
    expect(provenanceOf("operator_state", "ppe")).toEqual({ kind: "assumed" });
  });
  it("synthetic columns get a 'simulated' chip", () => {
    expect(provenanceOf("task_history", "operator_id")).toEqual({ kind: "simulated" });
  });
  it("real open data gets a source line", () => {
    expect(provenanceOf("weather_snapshots", "temperature_c")).toEqual({ kind: "source", label: "Open-Meteo archive, CC BY 4.0" });
    expect(provenanceOf("task_history", "wind_kmh")).toEqual({ kind: "source", label: "Weather: Open-Meteo archive, CC BY 4.0" });
  });
  it("organiser fields, derived fields and unlisted columns get nothing", () => {
    expect(provenanceOf("machine_state", "seatbelt_fastened")).toEqual({ kind: "none" });
    expect(provenanceOf("tasks", "eta_p50_min")).toEqual({ kind: "none" });
    expect(provenanceOf("tasks", "not_a_column")).toEqual({ kind: "none" });
    expect(provenanceKind("tasks", "not_a_column")).toBeNull();
  });
  it("a derived value inherits 'assumed' when one of its inputs is assumed (₹ at ₹92/L)", () => {
    expect(provenanceOf("anomalies", "cost_inr", { inputAssumed: true })).toEqual({ kind: "assumed" });
    expect(provenanceOf("anomalies", "severity_score")).toEqual({ kind: "none" });
  });
  it("anyAssumed drives the Simple-mode 'Some values are assumed' line", () => {
    expect(anyAssumed([["tasks", "progress_pct"], ["machine_state", "speed_kmh"]])).toBe(true);
    expect(anyAssumed([["tasks", "progress_pct"], ["machine_state", "load_cycles"]])).toBe(false);
  });
});
