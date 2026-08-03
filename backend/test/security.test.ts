// Unit tests for the security module and the session lifecycle behind it.
//
// Same approach as the other suites here: the shared Prisma client is replaced
// with jest.unstable_mockModule before the code under test is imported, so no
// database is touched. bcryptjs is left real — the account-deletion tests hash
// a password and then check it, which is cheap at the default cost factor and
// keeps the assertion honest about what is actually being compared.
//
// The cases worth their weight are the ones where getting it wrong is silent:
// a session belonging to someone else being accepted, a revoke that quietly
// matches nothing, and the "sign out everywhere else" sweep sparing the wrong
// row.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import bcrypt from "bcryptjs";

type AnyFn = (...args: any[]) => any;

const prismaMock = {
  user: {
    findUnique: jest.fn<AnyFn>(),
    delete: jest.fn<AnyFn>(),
  },
  session: {
    create: jest.fn<AnyFn>(),
    findUnique: jest.fn<AnyFn>(),
    findMany: jest.fn<AnyFn>(),
    update: jest.fn<AnyFn>(),
    updateMany: jest.fn<AnyFn>(),
    deleteMany: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

const {
  describeClient,
  createSession,
  loadActiveSession,
  touchSession,
  revokeOtherSessions,
  LAST_SEEN_THROTTLE_MS,
} = await import("../src/lib/sessions.ts");

const { getOverview, revokeSession, revokeOthers, deleteAccount } = await import(
  "../src/modules/security/security.service.ts"
);

const HOUR = 60 * 60 * 1000;

/** A live session row: owned by user 1, not revoked, expiring in an hour. */
function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-a",
    userId: 1,
    label: "Pixel 7",
    platform: "android",
    ipAddress: "10.0.0.5",
    createdAt: new Date("2026-08-01T09:00:00Z"),
    lastSeenAt: new Date("2026-08-03T09:00:00Z"),
    expiresAt: new Date(Date.now() + HOUR),
    revokedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.session.findMany.mockResolvedValue([]);
});

// ─── describeClient ───────────────────────────────────────────────────────────

describe("describeClient", () => {
  it("prefers the label the client sent over the User-Agent", () => {
    const result = describeClient({
      label: "Danny's S23",
      platform: "android",
      userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
      ipAddress: "192.168.1.4",
    });

    expect(result).toEqual({
      label: "Danny's S23",
      platform: "android",
      ipAddress: "192.168.1.4",
    });
  });

  it("falls back to a Browser-on-OS label when the client says nothing", () => {
    const result = describeClient({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });

    expect(result.label).toBe("Chrome on Windows");
    expect(result.platform).toBe("web");
  });

  it("survives a missing User-Agent rather than storing an empty label", () => {
    const result = describeClient({});

    expect(result.label).toBe("Unknown device");
    expect(result.platform).toBe("unknown");
    expect(result.ipAddress).toBeNull();
  });

  it("rejects an unrecognised platform instead of storing it verbatim", () => {
    const result = describeClient({ platform: "toaster", label: "Kitchen" });

    expect(result.platform).toBe("unknown");
  });

  it("strips newlines and caps the length of a hostile label", () => {
    const result = describeClient({ label: `evil\nsecond line ${"x".repeat(200)}` });

    expect(result.label).not.toContain("\n");
    expect(result.label.length).toBeLessThanOrEqual(60);
  });

  it("ignores a blank label and falls through to the User-Agent", () => {
    const result = describeClient({ label: "   ", userAgent: "Mozilla/5.0 (Linux; Android 14)" });

    expect(result.label).toBe("Android");
    expect(result.platform).toBe("android");
  });
});

// ─── createSession ────────────────────────────────────────────────────────────

describe("createSession", () => {
  it("stores the described client and returns the new id", async () => {
    prismaMock.session.create.mockResolvedValue({ id: "new-session" });

    const id = await createSession(7, { label: "iPhone 15", platform: "ios" });

    expect(id).toBe("new-session");

    const data = prismaMock.session.create.mock.calls[0][0].data;
    expect(data.userId).toBe(7);
    expect(data.label).toBe("iPhone 15");
    expect(data.platform).toBe("ios");
    // Mirrors the seven-day token: comfortably in the future, not unbounded.
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * HOUR);
  });
});

// ─── loadActiveSession ────────────────────────────────────────────────────────

describe("loadActiveSession", () => {
  it("returns a live session belonging to the caller", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionRow());

    await expect(loadActiveSession("session-a", 1)).resolves.not.toBeNull();
  });

  it("refuses a session id that belongs to a different user", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionRow({ userId: 2 }));

    await expect(loadActiveSession("session-a", 1)).resolves.toBeNull();
  });

  it("refuses a revoked session", async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      sessionRow({ revokedAt: new Date() })
    );

    await expect(loadActiveSession("session-a", 1)).resolves.toBeNull();
  });

  it("refuses an expired session", async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      sessionRow({ expiresAt: new Date(Date.now() - 1000) })
    );

    await expect(loadActiveSession("session-a", 1)).resolves.toBeNull();
  });

  it("refuses an unknown session id", async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);

    await expect(loadActiveSession("nope", 1)).resolves.toBeNull();
  });
});

// ─── touchSession ─────────────────────────────────────────────────────────────

describe("touchSession", () => {
  it("skips the write while lastSeenAt is still fresh", async () => {
    await touchSession({ id: "session-a", lastSeenAt: new Date() });

    expect(prismaMock.session.update).not.toHaveBeenCalled();
  });

  it("writes once the throttle window has passed", async () => {
    prismaMock.session.update.mockResolvedValue({});

    await touchSession({
      id: "session-a",
      lastSeenAt: new Date(Date.now() - LAST_SEEN_THROTTLE_MS - 1000),
    });

    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: "session-a" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("never rejects when the bookkeeping write fails", async () => {
    prismaMock.session.update.mockRejectedValue(new Error("connection lost"));

    await expect(
      touchSession({ id: "session-a", lastSeenAt: new Date(0) })
    ).resolves.toBeUndefined();
  });
});

// ─── revokeOtherSessions ──────────────────────────────────────────────────────

describe("revokeOtherSessions", () => {
  it("spares the session it is told to keep", async () => {
    prismaMock.session.updateMany.mockResolvedValue({ count: 2 });

    const count = await revokeOtherSessions(1, "session-a");

    expect(count).toBe(2);
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null, id: { not: "session-a" } },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokes everything when there is no session to keep", async () => {
    prismaMock.session.updateMany.mockResolvedValue({ count: 3 });

    await revokeOtherSessions(1, null);

    expect(prismaMock.session.updateMany.mock.calls[0][0].where).toEqual({
      userId: 1,
      revokedAt: null,
    });
  });
});

// ─── getOverview ──────────────────────────────────────────────────────────────

describe("getOverview", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "demo@voltwise.app",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      passwordChangedAt: null,
      passwordHash: "hashed",
    });
  });

  it("flags the caller's own session and nobody else's", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      sessionRow({ id: "session-a" }),
      sessionRow({ id: "session-b", label: "Chrome on Windows", platform: "web" }),
    ]);

    const result = await getOverview(1, "session-b");

    expect(result.currentSessionId).toBe("session-b");
    expect(result.sessions.map((s) => s.current)).toEqual([false, true]);
  });

  it("asks the database for live sessions only", async () => {
    await getOverview(1, "session-a");

    const where = prismaMock.session.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(1);
    expect(where.revokedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("reports a never-changed password as null rather than inventing a date", async () => {
    const result = await getOverview(1, "session-a");

    expect(result.account.passwordChangedAt).toBeNull();
    expect(result.account.hasPassword).toBe(true);
    expect(result.account.memberSince).toBe("2026-06-01T00:00:00.000Z");
  });

  it("reports an account with no password set", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "legacy@voltwise.app",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      passwordChangedAt: null,
      passwordHash: null,
    });

    const result = await getOverview(1, "session-a");

    expect(result.account.hasPassword).toBe(false);
  });

  it("throws 404 when the account is gone", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(getOverview(1, "session-a")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("still returns the overview when the dead-session sweep fails", async () => {
    prismaMock.session.deleteMany.mockRejectedValue(new Error("no permission"));

    await expect(getOverview(1, "session-a")).resolves.toHaveProperty("account");
  });
});

// ─── revokeSession ────────────────────────────────────────────────────────────

describe("revokeSession", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "demo@voltwise.app",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      passwordChangedAt: null,
      passwordHash: "hashed",
    });
  });

  it("refuses to revoke the caller's own session", async () => {
    await expect(revokeSession(1, "session-a", "session-a")).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
  });

  it("scopes the write to the caller's own user id", async () => {
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

    await revokeSession(1, "session-a", "session-b");

    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { id: "session-b", userId: 1, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("throws 404 when the id matches nothing this user owns", async () => {
    prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(revokeSession(1, "session-a", "someone-elses")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns a refreshed overview alongside the count", async () => {
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.session.findMany.mockResolvedValue([sessionRow({ id: "session-a" })]);

    const result = await revokeSession(1, "session-a", "session-b");

    expect(result.revokedCount).toBe(1);
    expect(result.overview.sessions).toHaveLength(1);
  });
});

// ─── revokeOthers ─────────────────────────────────────────────────────────────

describe("revokeOthers", () => {
  it("reports how many sessions it ended", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "demo@voltwise.app",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      passwordChangedAt: null,
      passwordHash: "hashed",
    });
    prismaMock.session.updateMany.mockResolvedValue({ count: 4 });

    const result = await revokeOthers(1, "session-a");

    expect(result.revokedCount).toBe(4);
    expect(prismaMock.session.updateMany.mock.calls[0][0].where.id).toEqual({
      not: "session-a",
    });
  });
});

// ─── deleteAccount ────────────────────────────────────────────────────────────

describe("deleteAccount", () => {
  it("deletes the user when the password matches", async () => {
    const passwordHash = await bcrypt.hash("correct horse", 10);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: "demo@voltwise.app",
      passwordHash,
    });
    prismaMock.user.delete.mockResolvedValue({});

    const result = await deleteAccount(1, "correct horse");

    expect(result).toEqual({ deleted: true, email: "demo@voltwise.app" });
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const passwordHash = await bcrypt.hash("correct horse", 10);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: "demo@voltwise.app",
      passwordHash,
    });

    await expect(deleteAccount(1, "wrong")).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("refuses an account that has no password to check", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: "legacy@voltwise.app",
      passwordHash: null,
    });

    await expect(deleteAccount(1, "anything")).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("throws 404 when the account is already gone", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(deleteAccount(1, "anything")).rejects.toMatchObject({ statusCode: 404 });
  });
});
