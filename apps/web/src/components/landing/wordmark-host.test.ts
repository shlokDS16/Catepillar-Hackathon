import { describe, expect, it, vi } from "vitest";
import { createWordmarkHost, type WordmarkController } from "./landing-engine";

const fake = () => {
  const ctl: WordmarkController = { setProgress: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
  const root = { dataset: {} as Record<string, string | undefined> };
  const canvas = new EventTarget();
  return { ctl, root, canvas };
};

describe("footer wordmark host", () => {
  it("mounts once, stays mounted when the footer is left and entered again, and still renders", async () => {
    const { ctl, root, canvas } = fake();
    const load = vi.fn(async () => ctl);
    const host = createWordmarkHost({ root, canvas, canRun: () => true, load });
    await host.enter();
    expect(root.dataset.wm).toBe("canvas");
    host.setProgress(0.2);
    // leave and return: the engine only calls enter() again, which must do nothing
    await host.enter();
    await host.enter();
    host.setProgress(0.8);
    expect(load).toHaveBeenCalledTimes(1);
    expect(ctl.dispose).not.toHaveBeenCalled();
    expect(ctl.setProgress).toHaveBeenLastCalledWith(0.8);
    expect(root.dataset.wm).toBe("canvas");
    host.resize();
    expect(ctl.resize).toHaveBeenCalled();
    host.dispose();
    expect(ctl.dispose).toHaveBeenCalledTimes(1);
  });

  it("only forwards progress that moved", async () => {
    const { ctl, root, canvas } = fake();
    const host = createWordmarkHost({ root, canvas, canRun: () => true, load: async () => ctl });
    await host.enter();
    host.setProgress(0.5);
    host.setProgress(0.5005);
    expect(ctl.setProgress).toHaveBeenCalledTimes(1);
  });

  it("falls back to the still when the mount fails", async () => {
    const { root, canvas } = fake();
    const host = createWordmarkHost({ root, canvas, canRun: () => true, load: async () => Promise.reject(new Error("no webgl")) });
    await host.enter();
    expect(root.dataset.wm).toBe("poster");
    host.setProgress(0.5);
  });

  it("uses the still without WebGL or on phones, and loads nothing", async () => {
    const { root, canvas } = fake();
    const load = vi.fn();
    const host = createWordmarkHost({ root, canvas, canRun: () => false, load });
    await host.enter();
    expect(root.dataset.wm).toBe("poster");
    expect(load).not.toHaveBeenCalled();
  });

  it("puts the still back if the context is lost, so the plate is never blank", async () => {
    const { ctl, root, canvas } = fake();
    const host = createWordmarkHost({ root, canvas, canRun: () => true, load: async () => ctl });
    await host.enter();
    expect(root.dataset.wm).toBe("canvas");
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(root.dataset.wm).toBe("poster");
  });

  it("disposes a mount that finishes after the page unmounted", async () => {
    const { ctl, root, canvas } = fake();
    let resolve!: (c: WordmarkController) => void;
    const host = createWordmarkHost({ root, canvas, canRun: () => true, load: () => new Promise((r) => (resolve = r)) });
    const p = host.enter();
    host.dispose();
    resolve(ctl);
    await p;
    expect(ctl.dispose).toHaveBeenCalledTimes(1);
    expect(root.dataset.wm).toBeUndefined();
  });
});
