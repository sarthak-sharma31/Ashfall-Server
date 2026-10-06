import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import Player from "../../models/Player.js";
import { send } from "../../utils/socketUtils.js";
import { generateUID } from "../../utils/helpers.js";

// Accepted Google OAuth client IDs (comma separated):
//   the Web client ID (used by Android sign-in) and, optionally, the Desktop client ID (editor testing)
const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const googleClient = new OAuth2Client();

// ------------------------------------------------------------------
// SESSION TOKENS
// Every login issues a random secret the client keeps on the device.
// Only its hash is stored, so a database leak can't be replayed.
// ------------------------------------------------------------------

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// The previous token stays valid for a short while after it's rotated, so a client whose
// connection dropped before it received the new token can still sign in on reconnect.
const PREVIOUS_TOKEN_GRACE_MS = 5 * 60 * 1000;

function hashEquals(storedHash, token) {
  if (!storedHash) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenMatches(player, token) {
  if (!player || typeof token !== "string" || token.length < 16) return false;
  if (hashEquals(player.authTokenHash, token)) return true;
  return !!player.prevTokenUntil && player.prevTokenUntil > new Date() && hashEquals(player.prevTokenHash, token);
}

async function issueSession(ws, player) {
  const token = crypto.randomBytes(32).toString("hex");
  player.prevTokenHash = player.authTokenHash ?? null;
  player.prevTokenUntil = player.authTokenHash ? new Date(Date.now() + PREVIOUS_TOKEN_GRACE_MS) : null;
  player.authTokenHash = hashToken(token);
  player.lastLogin = new Date();
  await player.save();

  send(ws, "login_success", {
    uid: player.uid,
    token,
    provider: player.googleSub ? "google" : "guest",
    email: player.email ?? "",
    username: player.username,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    gems: player.gems,
    tickets: player.tickets,
    character: player.character,
    joined: player.createdAt?.toISOString?.() ?? "",
    kills: player.kills ?? 0,
    deaths: player.deaths ?? 0,
    matchesPlayed: player.matchesPlayed ?? 0,
    wins: player.wins ?? 0
  });
}

function fail(ws, reason, message) {
  send(ws, "login_failed", { reason, message });
}

// ------------------------------------------------------------------
// GUEST
// ------------------------------------------------------------------

export async function handleGuestLogin(ws, data) {
  if (data?.uid) {
    const player = await Player.findOne({ uid: String(data.uid) });

    if (player) {
      if (tokenMatches(player, data.token)) return issueSession(ws, player);

      // Google accounts can never be opened with a UID alone
      if (player.googleSub) {
        return fail(ws, "use_google", "This account is linked to Google. Sign in with Google.");
      }

      // Accounts created before session tokens existed: accept once, then require the token
      if (!player.authTokenHash) return issueSession(ws, player);

      return fail(ws, "invalid_session", "Your saved login expired. Start a new guest account or sign in with Google.");
    }
  }

  const uid = generateUID();
  const player = await Player.create({
    uid,
    username: "Guest_" + uid.slice(-4)
  });
  console.log("✅ New guest account created:", uid);
  return issueSession(ws, player);
}

// Silent login from a saved session (guest or Google)
export async function handleResumeSession(ws, data) {
  const player = data?.uid ? await Player.findOne({ uid: String(data.uid) }) : null;
  if (!player || !tokenMatches(player, data.token)) {
    return fail(ws, "invalid_session", "Your saved login expired. Please sign in again.");
  }
  return issueSession(ws, player);
}

// ------------------------------------------------------------------
// GOOGLE
// ------------------------------------------------------------------

export async function handleGoogleLogin(ws, data) {
  if (googleClientIds.length === 0) {
    return fail(ws, "google_not_configured", "Google sign-in isn't configured on the server yet.");
  }
  if (!data?.idToken) {
    return fail(ws, "google_failed", "Google sign-in failed. Please try again.");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: data.idToken,
      audience: googleClientIds
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.warn("Google token rejected:", err.message);
    return fail(ws, "google_failed", "Google sign-in couldn't be verified. Please try again.");
  }

  const sub = payload.sub;
  let player = await Player.findOne({ googleSub: sub });

  if (!player && data.linkUid) {
    // Link the current guest account to Google so its progress is kept
    const guest = await Player.findOne({ uid: String(data.linkUid) });
    if (guest && !guest.googleSub && tokenMatches(guest, data.linkToken)) {
      player = guest;
      console.log("🔗 Guest linked to Google:", guest.uid);
    }
  }

  if (!player) {
    const uid = generateUID();
    player = new Player({
      uid,
      username: cleanName(payload.given_name || payload.name) || "Agent_" + uid.slice(-4)
    });
    console.log("✅ New Google account created:", uid);
  }

  player.googleSub = sub;
  player.email = payload.email ?? player.email;
  if (!player.username || player.username.startsWith("Guest_")) {
    player.username = cleanName(payload.given_name || payload.name) || player.username;
  }
  return issueSession(ws, player);
}

// ------------------------------------------------------------------
// LOGOUT
// ------------------------------------------------------------------

export async function handleLogout(ws, data) {
  const player = data?.uid ? await Player.findOne({ uid: String(data.uid) }) : null;
  if (player && tokenMatches(player, data.token)) {
    player.authTokenHash = null;
    player.prevTokenHash = null;
    player.prevTokenUntil = null;
    await player.save();
  }
  send(ws, "logged_out", {});
}

function cleanName(name) {
  if (!name) return "";
  return String(name).replace(/[^\p{L}\p{N}_ .-]/gu, "").trim().slice(0, 16);
}

export default handleGuestLogin;
