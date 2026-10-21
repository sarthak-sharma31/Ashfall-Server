import crypto from "crypto";

import {
  clients,
  rooms,
  roomReady,
  botIds
} from "../../state/gameState.js";

import { matchmakingState } from "../../state/matchmakingState.js";

import {
  MAX_PLAYERS,
  BOT_FILL_DELAY,
  MAPS
} from "../../config/constants.js";

import { send } from "../../utils/socketUtils.js";

import { startMatch } from "../game/gameFlow.js";

// Names bots get in the match (the same on every player's screen)
const BOT_NAMES = [
  "Kaito", "Yuki", "Ren", "Hana", "Sora", "Akira", "Mika", "Daichi", "Nova", "Riku",
  "Aoi", "Haru", "Kenji", "Luna", "Taro", "Emi", "Shin", "Rei", "Jin", "Yume"
];

function isBot(id) {
  return id.startsWith("bot_");
}

// ------------------------------------------------------------------
// MAP CHOICE
// The client sends the maps the player ticked ("maps": "NTE,School" or an array).
// No maps (or "random") means any map. Older clients send a single "map".
// ------------------------------------------------------------------

export function parseMaps(data) {
  let wanted = data?.maps ?? data?.map ?? [];
  if (typeof wanted === "string") wanted = wanted.split(",");
  if (!Array.isArray(wanted)) wanted = [];

  const picked = [...new Set(wanted.map(m => String(m).trim()))].filter(m => MAPS.includes(m));
  return picked.length > 0 ? picked : [...MAPS]; // nothing valid = random
}

// Oldest waiting group that still has room and shares at least one map with the player
export function findGroup(groups, maps) {
  return groups.find(g =>
    g.players.length < MAX_PLAYERS &&
    g.maps.some(m => maps.includes(m))
  );
}

function groupOf(playerId) {
  return matchmakingState.groups.find(g => g.players.some(p => p.playerId === playerId));
}

// ------------------------------------------------------------------
// QUEUE
// ------------------------------------------------------------------

export function startMatchmaking(ws, data) {

  const client = clients.get(ws);

  if (!client) return;

  const playerId = client.playerId;

  if (groupOf(playerId)) return;

  const maps = parseMaps(data);

  const entry = {
    playerId,
    ws,
    name: client.username,
    loadout: {
      character: data?.character,
      primary: data?.primary,
      secondary: data?.secondary
    },
    maps
  };

  let group = findGroup(matchmakingState.groups, maps);

  if (group) {
    // The group can now only go to maps everyone in it accepts
    group.maps = group.maps.filter(m => maps.includes(m));
    group.players.push(entry);
  } else {
    group = {
      id: crypto.randomUUID().slice(0, 8),
      maps: [...maps],
      players: [entry],
      createdAt: Date.now()
    };
    matchmakingState.groups.push(group);

    // Nobody else turned up in time: start with bots
    group.timer = setTimeout(() => startGroup(group, true), BOT_FILL_DELAY);
  }

  console.log(`🎮 Queued: ${playerId} maps=[${maps}] -> group ${group.id} [${group.maps}] (${group.players.length}/${MAX_PLAYERS})`);

  if (group.players.length >= MAX_PLAYERS) {
    startGroup(group, false);
  }

}

export function cancelMatchmaking(ws) {

  const client = clients.get(ws);

  if (!client) return;

  const group = groupOf(client.playerId);
  if (!group) return;

  group.players = group.players.filter(p => p.playerId !== client.playerId);

  if (group.players.length === 0) {
    clearTimeout(group.timer);
    matchmakingState.groups = matchmakingState.groups.filter(g => g !== group);
  } else {
    // Someone with a narrower choice left: the group may accept more maps again
    group.maps = MAPS.filter(m => group.players.every(p => p.maps.includes(m)));
  }

  console.log("❌ Matchmaking cancelled:", client.playerId);

}

// ------------------------------------------------------------------
// START A MATCH (every match gets its own room)
// ------------------------------------------------------------------

function startGroup(group, fillWithBots) {

  clearTimeout(group.timer);
  matchmakingState.groups = matchmakingState.groups.filter(g => g !== group);

  // Drop players whose connection closed while waiting
  const queuedPlayers = group.players.filter(p => clients.has(p.ws));
  if (queuedPlayers.length === 0) return;

  const roomId = "room_" + group.id;

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

  // Any map the whole group accepts
  room.map = group.maps[Math.floor(Math.random() * group.maps.length)] ?? MAPS[0];

  queuedPlayers.forEach(p => {

    room.players.push(p.playerId);

    room.playerLoadouts[p.playerId] = { ...p.loadout, name: p.name };

    const client = clients.get(p.ws);

    if (client) {
      client.roomId = roomId;
    }

  });

  if (fillWithBots) {

    const botsNeeded =
      MAX_PLAYERS - room.players.length;

    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);

    for (let i = 0; i < botsNeeded; i++) {

      const botId =
        "bot_" + crypto.randomUUID();

      room.players.push(botId);

      room.playerLoadouts[botId] = {
        character: "DefaultSoldier",
        primary: "rifle",
        secondary: "pistol",
        name: names[i % names.length]
      };

      botIds[roomId].push(botId);

      roomReady[roomId][botId] = true;

    }

  }

  const realPlayers =
    room.players.filter(p => !isBot(p));

  const hostId = realPlayers[0];
  room.hostId = hostId; // runs the bots; may send updates on their behalf (utils/actorUtils.js)

  console.log(`🏁 ${roomId} on ${room.map}: ${realPlayers.length} players + ${botIds[roomId].length} bots`);

  for (const [ws, client] of clients.entries()) {

    if (client.roomId === roomId) {

      send(ws, "room_updated", {
        roomId,
        isHost: client.playerId === hostId,
        botCount: botIds[roomId].length,
        botIds: botIds[roomId].join(","),
        map: room.map
      });

    }

  }

}
