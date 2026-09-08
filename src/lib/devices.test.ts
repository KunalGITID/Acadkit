import { describe, expect, it } from "vitest";
import { chooseDevice, entryScreen } from "@/lib/devices";

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

/**
 * The split second of onboarding after a successful sign-in: a session
 * arrives before the PIN lookup does, and "no PIN yet" was being read as
 * "no account".
 */
describe("entryScreen", () => {
  const signedIn = { sessionLoading: false, signedIn: true, devicesResolved: false };

  it("holds until the stored session has been read", () => {
    expect(
      entryScreen({ sessionLoading: true, signedIn: false, pin: null, devicesResolved: false })
    ).toBe("holding");
    // Even with everything else in hand: the session is the first fact.
    expect(
      entryScreen({ sessionLoading: true, signedIn: true, pin: "0404", devicesResolved: true })
    ).toBe("holding");
  });

  it("asks for sign-in when there is no session", () => {
    expect(
      entryScreen({ sessionLoading: false, signedIn: false, pin: null, devicesResolved: true })
    ).toBe("sign-in");
  });

  it("holds rather than flashing onboarding at someone who just signed in", () => {
    expect(entryScreen({ ...signedIn, pin: null })).toBe("holding");
  });

  it("onboards once the lookup says the account owns nothing", () => {
    expect(entryScreen({ ...signedIn, pin: null, devicesResolved: true })).toBe("onboarding");
  });

  it("opens the app the moment a PIN exists, without waiting on the lookup", () => {
    // Every launch after the first: the reconcile runs behind the app,
    // so it must never cost a round trip on screen.
    expect(entryScreen({ ...signedIn, pin: "0404" })).toBe("app");
  });
});
