import {
  clients,
  health,
  alive
} from "../../state/gameState.js";

import { broadcast } from "../../utils/socketUtils.js";

import { checkWin } from "../game/gameFlow.js";

export function handlePlayerHit(ws, data) {

  const client = clients.get(ws);

  if (!client?.roomId) return;

  const roomId = client.roomId;

  const targetId = data.playerId;

  if (health[targetId] == null) return;

  health[targetId] -= data.damage;

  health[targetId] =
    Math.max(0, health[targetId]);

  broadcast(roomId, "player_damaged", {
    playerId: targetId,
    health: health[targetId]
  });

  if (health[targetId] <= 0) {

    alive[targetId] = false;

    broadcast(roomId, "player_eliminated", {
      victimId: targetId,
      killerId: client.playerId
    });

    checkWin(roomId);

  }

}