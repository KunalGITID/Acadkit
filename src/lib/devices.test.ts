import { describe, expect, it } from "vitest";
import { chooseDevice } from "@/lib/devices";

/**
 * This is the logic that stranded a device on PIN 1234 — the mock
 * server's — after the PIN switcher was removed from Settings, leaving
 * an empty app and no UI to fix it.
 */
describe("chooseDevice", () => {
  it("adopts the account's PIN when the device has none", () => {
    expect(chooseDevice(null, ["0404"])).toBe("0404");
  });

  it("replaces a PIN the account does not own", () => {
    // The stale-PIN trap: 1234 is left over, 0404 is what's claimed.
    expect(chooseDevice("1234", ["0404"])).toBe("0404");
  });

  it("leaves a PIN alone when it is already ours", () => {
    // Must return the same value, not merely an owned one — returning a
    // different PIN here would churn the store on every load.
    expect(chooseDevice("1234", ["0404", "1234"])).toBe("1234");
  });

  it("defers to onboarding when nothing is claimed", () => {
    expect(chooseDevice(null, [])).toBeNull();
    expect(chooseDevice("1234", [])).toBeNull();
  });

  it("takes the oldest claim when several exist", () => {
    // ownedDevices orders by claimed_at ascending.
    expect(chooseDevice(null, ["0404", "1234", "5678"])).toBe("0404");
  });
});
