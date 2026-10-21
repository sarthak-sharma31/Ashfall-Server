import { startMatch } from "../game/gameFlow.js";

import {
  clients,
  currentProp,
  playerState,
  roomReady,
  rooms,
  botIds
} from "../../state/gameState.js";

import { broadcast, send } from "../../utils/socketUtils.js";
import { resolveActor } from "../../utils/actorUtils.js";

export function handlePropChange(ws, data) {

  const client = clients.get(ws);

  if (!client?.roomId) return;

  const playerId = resolveActor(client, data?.playerId);
  currentProp[playerId] = data.prop;

  broadcast(client.roomId, "prop_change", {
    playerId,
    prop: data.prop
  });

}

export function handlePlayerPosition(ws, data) {

  const client = clients.get(ws);

  if (!client?.roomId) return;

  // Bot positions come from the host with the bot's id
  const playerId = resolveActor(client, data?.playerId);

  playerState[playerId] = {
    position: data.position,
    rotation: data.rotation,
    camPosition: data.camPosition,
    camRotation: data.camRotation
  };

  broadcast(client.roomId, "player_position", {
    playerId,
    position: data.position,
    rotation: data.rotation,
    camPosition: data.camPosition,
    camRotation: data.camRotation
  });

}

export function handleSceneLoaded(ws) {
  const client = clients.get(ws);

  if (!client?.roomId) return;

  const roomId = client.roomId;
  const room = rooms[roomId];

  if (!room) return;

  roomReady[roomId] ??= {};
  roomReady[roomId][client.playerId] = true;

  checkAllReady(roomId);
}

// Spawns everyone once every real player in the room has loaded the map
export function checkAllReady(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const realPlayers = room.players.filter(id => !id.startsWith("bot_"));

  // Nobody may have loaded yet (a player can leave during loading)
  const ready = roomReady[roomId] ?? {};
  const allRealPlayersReady = realPlayers.every(id => ready[id]);

  if (!allRealPlayersReady) return;
  if (room.hasSpawned) return;

  room.hasSpawned = true;
  spawnPlayers(roomId);

  startMatch(roomId);
}

function spawnPlayers(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const spawnPoints = [
    { x: 0, y: 1, z: 0 },
    { x: 3, y: 1, z: 0 },
    { x: -3, y: 1, z: 0 },
    { x: 0, y: 1, z: 3 },
    { x: 0, y: 1, z: -3 },
    { x: 5, y: 1, z: 5 }
  ];

  for (const [ws, client] of clients.entries()) {
    if (client.roomId !== roomId) continue;

    room.players.forEach((playerId, index) => {
      const loadout = room.playerLoadouts[playerId] ?? {};

      send(ws, "spawn_player", {
        playerId,
        isBot: playerId.startsWith("bot_"),
        character: loadout.character ?? "DefaultSoldier",
        name: loadout.name ?? "",
        team: "none",
        position: spawnPoints[index % spawnPoints.length]
      });
    });
  }
}
