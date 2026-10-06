import crypto from "crypto";

import { clients } from "../state/gameState.js";

import { send } from "../utils/socketUtils.js";

import handleSocketEvent from "./eventRouter.js";

import { cancelMatchmaking } from "../features/matchmaking/matchmakingService.js";

// Events that a client waits on; if they crash, the client must still get an answer
const LOGIN_EVENTS = new Set(["guest_login", "resume_session", "google_login"]);

// Drop sockets whose network died without closing (phone lost signal, app killed)
const HEARTBEAT_MS = 30000;

export default function initializeSocket(wss) {

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_MS);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws) => {

    const playerId = crypto.randomUUID();

    clients.set(ws, {
      playerId,
      roomId: null
    });

    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    console.log("🟢 Player connected:", playerId);

    send(ws, "connected", { playerId });

    ws.on("message", async(raw) => {

      ws.isAlive = true;
      let type = "";

      try {

        const parsed = JSON.parse(raw || "{}");
        type = parsed.type;

        // Client keep-alive: lets the game notice a dead connection quickly
        if (type === "ping") {
          send(ws, "pong", {});
          return;
        }

        await handleSocketEvent(ws, type, parsed.data);

      } catch (err) {

        console.error("Socket message error:", err);

        if (LOGIN_EVENTS.has(type)) {
          send(ws, "login_failed", {
            reason: "server_error",
            message: "The server is having trouble right now. Please try again in a moment."
          });
        }

      }

    });

    ws.on("close", () => {

      console.log("🔴 Player disconnected:", playerId);

      cancelMatchmaking(ws);

      clients.delete(ws);

      // later:
      // remove from rooms
      // cleanup room

    });

  });

}
