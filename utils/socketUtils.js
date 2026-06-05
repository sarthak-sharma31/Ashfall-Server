import { clients } from "../state/gameState.js";

export function send(ws, type, data = {}) {

  ws.send(
    JSON.stringify({
      type,
      data
    })
  );

}

export function broadcast(
  roomId,
  type,
  data = {}
) {

  for (const [ws, client] of clients.entries()) {

    if (client.roomId === roomId) {

      send(ws, type, data);

    }

  }

}