import {
  rooms,
  roomReady,
  botIds
} from "../../state/gameState.js";

export function cleanupRoom(roomId) {

  delete rooms[roomId];

  delete roomReady[roomId];

  delete botIds[roomId];

  console.log("🗑️ Room cleaned:", roomId);

}