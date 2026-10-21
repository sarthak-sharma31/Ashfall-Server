import { rooms } from "../state/gameState.js";

// Which player an update is about.
// The host's game runs the bots, so it also sends their positions, disguises and shots,
// naming the bot in data.playerId. Only the host may speak for a bot (and only one in its room);
// everyone else always speaks for themselves.
export function resolveActor(client, claimedId) {
  const room = rooms[client?.roomId];
  if (
    room &&
    typeof claimedId === "string" &&
    claimedId !== client.playerId &&
    claimedId.startsWith("bot_") &&
    room.players.includes(claimedId) &&
    room.hostId === client.playerId
  ) {
    return claimedId;
  }
  return client.playerId;
}
