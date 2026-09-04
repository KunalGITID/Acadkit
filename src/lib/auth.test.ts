import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The auth layer is where every bug in this migration came from: PINs
 * that read empty because they were never claimed, a device stranded on
 * a stale PIN, a sign-out that left the previous account's data behind.
 * All of it was caught by hand. These cover the decisions.
 *
 * The Supabase client is mocked rather than reached — what's under test
 * is how the app reacts to its answers, particularly the unique-violation
 * path that decides whether a PIN is yours or somebody else's.
 */

const insert = vi.fn();
const select = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () => getUser(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: (table: string) => ({
      insert: (row: unknown) => insert(table, row),
      select: () => ({
        order: () => select(table),
      }),
    }),
  },
}));

const { claimDevice, ownedDevices } = await import("@/lib/auth");

const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  insert.mockReset();
  select.mockReset();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: USER } } });
});

describe("claimDevice", () => {
  it("claims a free PIN for the signed-in user", async () => {
    insert.mockResolvedValue({ error: null });
    await expect(claimDevice("0404")).resolves.toBe("claimed");
    expect(insert).toHaveBeenCalledWith("device_owners", {
      device_id: "0404",
      user_id: USER,
    });
  });

  it("reports already-yours when the duplicate is your own claim", async () => {
    // 23505 is the unique violation the primary key raises.
    insert.mockResolvedValue({ error: { code: "23505" } });
    select.mockResolvedValue({ data: [{ device_id: "0404" }], error: null });
    await expect(claimDevice("0404")).resolves.toBe("already-yours");
  });

  it("reports taken when the duplicate belongs to someone else", async () => {
    insert.mockResolvedValue({ error: { code: "23505" } });
    // The row exists, but not in *our* list — RLS hides other people's.
    select.mockResolvedValue({ data: [{ device_id: "9999" }], error: null });
    await expect(claimDevice("0404")).resolves.toBe("taken");
  });

  it("never silently swallows an unexpected database error", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    await expect(claimDevice("0404")).rejects.toThrow("denied");
  });

  it("refuses to claim when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(claimDevice("0404")).rejects.toThrow(/not signed in/i);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("ownedDevices", () => {
  it("returns the claimed PINs in order", async () => {
    select.mockResolvedValue({
      data: [{ device_id: "0404" }, { device_id: "1234" }],
      error: null,
    });
    await expect(ownedDevices()).resolves.toEqual(["0404", "1234"]);
  });

  it("is empty rather than null when nothing is claimed", async () => {
    select.mockResolvedValue({ data: null, error: null });
    await expect(ownedDevices()).resolves.toEqual([]);
  });

  it("surfaces an error instead of pretending you own nothing", async () => {
    // Silently returning [] here would look identical to "no claims",
    // and useAutoDevice would strand the device on onboarding.
    select.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(ownedDevices()).rejects.toThrow("network down");
  });
});
