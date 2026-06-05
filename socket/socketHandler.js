import crypto from "crypto";

import { clients } from "../state/gameState.js";

import { send } from "../utils/socketUtils.js";

import handleSocketEvent from "./eventRouter.js";

export default function initializeSocket(wss) {

  wss.on("connection", (ws) => {

    const playerId = crypto.randomUUID();

    clients.set(ws, {
      playerId,
      roomId: null
    });

    console.log("🟢 Player connected:", playerId);

    send(ws, "connected", { playerId });

    ws.on("message", async(raw) => {

      try {

        const { type, data } = JSON.parse(raw || "{}");

        await handleSocketEvent(ws, type, data);

      } catch (err) {

        console.error("Socket message error:", err);

      }

    });

    ws.on("close", () => {

      console.log("🔴 Player disconnected:", playerId);

      clients.delete(ws);

      // later:
      // remove from rooms
      // remove from matchmaking
      // cleanup room

    });

  });

}