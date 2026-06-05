import {
  clients,
  rooms,
  roomReady,
  botIds
} from "../../state/gameState.js";

import { matchmakingState } from "../../state/matchmakingState.js";

import {
  MAX_PLAYERS,
  BOT_FILL_DELAY
} from "../../config/constants.js";

import { send } from "../../utils/socketUtils.js";

import { startMatch } from "../game/gameFlow.js";

import crypto from "crypto";

function isBot(id) {
  return id.startsWith("bot_");
}

export function startMatchmaking(ws, data) {

  const client = clients.get(ws);

  if (!client) return;

  const playerId = client.playerId;

  if (
    matchmakingState.queue.some(
      p => p.playerId === playerId
    )
  ) return;

  matchmakingState.queue.push({
    playerId,
    ws,
    loadout: {
      character: data.character,
      primary: data.primary,
      secondary: data.secondary
    }
  });

  console.log("🎮 Queued:", playerId);

  if (matchmakingState.queue.length === 1) {

    clearTimeout(matchmakingState.timer);

    matchmakingState.timer = setTimeout(() => {

      if (matchmakingState.queue.length > 0) {
        startPublicMatch(true);
      }

    }, BOT_FILL_DELAY);

  }

  if (matchmakingState.queue.length >= MAX_PLAYERS) {

    clearTimeout(matchmakingState.timer);

    startPublicMatch(false);

  }

}

export function cancelMatchmaking(ws) {

  const client = clients.get(ws);

  if (!client) return;

  matchmakingState.queue =
    matchmakingState.queue.filter(
      p => p.playerId !== client.playerId
    );

  console.log("❌ Matchmaking cancelled");

}

function startPublicMatch(fillWithBots) {

  const roomId = "public";

  rooms[roomId] = {
    players: [],
    state: "lobby",
    playerLoadouts: {},
    initialTeams: {},
    roundEnding: false
  };

  roomReady[roomId] = {};
  botIds[roomId] = [];

  const room = rooms[roomId];

  const queuedPlayers =
    matchmakingState.queue.splice(
      0,
      matchmakingState.queue.length
    );

  queuedPlayers.forEach(p => {

    room.players.push(p.playerId);

    room.playerLoadouts[p.playerId] =
      p.loadout;

    const client = clients.get(p.ws);

    if (client) {
      client.roomId = roomId;
    }

  });

  if (fillWithBots) {

    const botsNeeded =
      MAX_PLAYERS - room.players.length;

    for (let i = 0; i < botsNeeded; i++) {

      const botId =
        "bot_" + crypto.randomUUID();

      room.players.push(botId);

      room.playerLoadouts[botId] = {
        character: "DefaultSoldier",
        primary: "rifle",
        secondary: "pistol"
      };

      botIds[roomId].push(botId);

      roomReady[roomId][botId] = true;

    }

  }

  const realPlayers =
    room.players.filter(p => !isBot(p));

  const hostId = realPlayers[0];

  for (const [ws, client] of clients.entries()) {

    if (client.roomId === roomId) {

      send(ws, "room_updated", {
        roomId,
        isHost: client.playerId === hostId,
        botCount: botIds[roomId].length,
        botIds: botIds[roomId].join(",")
      });

    }

  }

}
