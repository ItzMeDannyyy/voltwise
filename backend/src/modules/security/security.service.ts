// Documentation only: Service layer for the security module.
// Reads and revokes the caller's sessions and deletes their account. All logic
// here is scoped to a single userId, taken from the verified token by the
// controller — nothing in this file accepts a user id from a request body.
// No HTTP-specific objects (req, res) ever appear here.

import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.ts";
import { revokeOtherSessions } from "../../lib/sessions.ts";
import { AppError } from "../../lib/AppError.ts";
import type {
  SecurityOverviewDto,
  SessionSummaryDto,
  RevokeResultDto,
  DeleteAccountResultDto,
} from "./security";

// How long a dead session row is kept before the next overview read sweeps it
// away. Expired and revoked rows have no purpose once nobody is going to ask
// what happened to them, and without this the table only ever grows.
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Documentation only: Converts a Prisma Session row into the shape the app
// consumes, marking the caller's own session so it can be labelled "this
// device" and protected from the revoke button.
// Accepts the session row and the current session id.
// Returns a SessionSummaryDto.
const formatSession = (
  session: {
    id: string;
    label: string;
    platform: string;
    ipAddress: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
  },
  currentSessionId: string
): SessionSummaryDto => ({
  id: session.id,
  label: session.label,
  platform: session.platform,
  ipAddress: session.ipAddress,
  createdAt: session.createdAt.toISOString(),
  lastSeenAt: session.lastSeenAt.toISOString(),
  expiresAt: session.expiresAt.toISOString(),
  current: session.id === currentSessionId,
});

// Documentation only: Deletes session rows that expired longer ago than
// SESSION_RETENTION_MS. Runs opportunistically when someone opens the security
// screen rather than on a schedule — this codebase has no job runner, and the
// only cost of a late sweep is a few dead rows nobody can see.
// Errors are swallowed: failing to tidy up must not break the screen.
// Accepts userId (number).
// Returns a Promise that always resolves.
const pruneDeadSessions = async (userId: number): Promise<void> => {
  try {
    await prisma.session.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date(Date.now() - SESSION_RETENTION_MS) },
      },
    });
  } catch {
    // Ignored on purpose — see the note above.
  }
};

// Documentation only: Builds the whole Privacy & Security payload: the
// account-safety facts and every session that could still be used to sign in.
// Revoked and expired sessions are filtered out rather than shown greyed —
// a list of "devices signed in to your account" is only useful if every row on
// it is true right now.
// Throws AppError 404 if the user no longer exists.
// Accepts userId (number) and currentSessionId (string) from the request.
// Returns a Promise resolving to SecurityOverviewDto.
export const getOverview = async (
  userId: number,
  currentSessionId: string
): Promise<SecurityOverviewDto> => {
  await pruneDeadSessions(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      createdAt: true,
      passwordChangedAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new AppError(404, "User account not found.");
  }

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return {
    account: {
      email: user.email,
      memberSince: user.createdAt.toISOString(),
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      hasPassword: user.passwordHash !== null,
    },
    currentSessionId,
    sessions: sessions.map((session) => formatSession(session, currentSessionId)),
  };
};

// Documentation only: Revokes one named session belonging to the caller.
// Refuses to revoke the caller's own session (400): the app signs out locally
// for that, and doing it here would leave the screen holding a token that dies
// on its next request with no explanation.
// Throws AppError 404 when the id does not belong to this user or is already
// revoked — the two are deliberately indistinguishable so the endpoint cannot
// be used to probe which session ids exist.
// Accepts userId (number), currentSessionId (string) and the targeted
// sessionId (string).
// Returns a Promise resolving to RevokeResultDto with the refreshed overview.
export const revokeSession = async (
  userId: number,
  currentSessionId: string,
  sessionId: string
): Promise<RevokeResultDto> => {
  if (sessionId === currentSessionId) {
    throw new AppError(
      400,
      "That is this device. Use sign out to end the current session."
    );
  }

  // updateMany rather than update: it scopes the write to this user in the
  // same statement, so another account's session id simply matches nothing.
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new AppError(404, "That session is no longer signed in.");
  }

  return {
    revokedCount: result.count,
    overview: await getOverview(userId, currentSessionId),
  };
};

// Documentation only: Revokes every session on the account except the caller's.
// The one-tap answer to "I have signed in somewhere I should not have".
// Accepts userId (number) and currentSessionId (string).
// Returns a Promise resolving to RevokeResultDto with the refreshed overview.
export const revokeOthers = async (
  userId: number,
  currentSessionId: string
): Promise<RevokeResultDto> => {
  const revokedCount = await revokeOtherSessions(userId, currentSessionId);

  return {
    revokedCount,
    overview: await getOverview(userId, currentSessionId),
  };
};

// Documentation only: Permanently deletes the caller's account after checking
// their password. Every owned row goes with it — devices, readings, alerts,
// tariffs, billing periods, rooms and sessions all cascade from User in the
// Prisma schema, so this single delete leaves nothing behind.
// Throws AppError 404 if the user is already gone, 400 if the account has no
// password to check against, and 401 if the password is wrong.
// Accepts userId (number) and the plaintext password from the request.
// Returns a Promise resolving to DeleteAccountResultDto.
export const deleteAccount = async (
  userId: number,
  password: string
): Promise<DeleteAccountResultDto> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, "User account not found.");
  }

  if (!user.passwordHash) {
    throw new AppError(
      400,
      "This account has no password set, so it cannot be deleted from the app. Please contact support."
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "That password is incorrect.");
  }

  await prisma.user.delete({ where: { id: userId } });

  return { deleted: true, email: user.email };
};
