import { describe, expect, it, vi } from "vitest";
import {
  createGuideSeenStore,
  guideIsOpen,
  GUIDE_SEEN_KEY,
  parseGuideSeen,
  type GuideStorage,
} from "./guide-seen";

function memoryStorage(): GuideStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

/** Safari private mode: both methods throw. */
const throwingStorage: GuideStorage = {
  getItem: () => {
    throw new DOMException("denied");
  },
  setItem: () => {
    throw new DOMException("quota");
  },
};

describe("the seen flag", () => {
  it("starts unseen and remembers after one markSeen", () => {
    const storage = memoryStorage();
    const store = createGuideSeenStore(() => storage);
    expect(parseGuideSeen(store.getSnapshot())).toEqual({ seen: false, persistFailed: false });
    store.markSeen();
    expect(parseGuideSeen(store.getSnapshot())).toEqual({ seen: true, persistFailed: false });
    expect(storage.map.get(GUIDE_SEEN_KEY)).toBe("1");
  });
  it("reads a flag a previous visit wrote", () => {
    const storage = memoryStorage();
    storage.map.set(GUIDE_SEEN_KEY, "1");
    expect(parseGuideSeen(createGuideSeenStore(() => storage).getSnapshot()).seen).toBe(true);
  });
  it("treats any other stored value as unseen", () => {
    const storage = memoryStorage();
    storage.map.set(GUIDE_SEEN_KEY, "yes");
    expect(parseGuideSeen(createGuideSeenStore(() => storage).getSnapshot()).seen).toBe(false);
  });
  it("tells subscribers once per markSeen and stops after unsubscribe", () => {
    const store = createGuideSeenStore(memoryStorage);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.markSeen();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.markSeen();
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("returns an identical snapshot string while nothing changes", () => {
    const store = createGuideSeenStore(memoryStorage);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});

describe("private mode", () => {
  it("falls back to this page only and says the write failed", () => {
    const store = createGuideSeenStore(() => throwingStorage);
    expect(parseGuideSeen(store.getSnapshot())).toEqual({ seen: false, persistFailed: false });
    store.markSeen();
    // Seen for this page, and honest that the next visit will show it again.
    expect(parseGuideSeen(store.getSnapshot())).toEqual({ seen: true, persistFailed: true });
  });
  it("survives a browser with no storage object at all", () => {
    const store = createGuideSeenStore(() => null);
    expect(parseGuideSeen(store.getSnapshot()).seen).toBe(false);
    store.markSeen();
    expect(parseGuideSeen(store.getSnapshot())).toEqual({ seen: true, persistFailed: true });
  });
});

describe("the server snapshot", () => {
  it("reports seen, so a returning operator never gets a flash of the guide", () => {
    expect(parseGuideSeen(createGuideSeenStore(memoryStorage).getServerSnapshot()).seen).toBe(true);
  });
});

describe("when the guide is open", () => {
  it("opens by itself only before the first practice", () => {
    expect(guideIsOpen("auto", false)).toBe(true);
    expect(guideIsOpen("auto", true)).toBe(false);
  });
  it("obeys an explicit tap either way", () => {
    expect(guideIsOpen("open", true)).toBe(true);
    expect(guideIsOpen("closed", false)).toBe(false);
  });
});
