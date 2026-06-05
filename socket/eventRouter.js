import handleGuestLogin
from "../features/auth/authHandler.js";

import {
  startMatchmaking,
  cancelMatchmaking
}
from "../features/matchmaking/matchmakingService.js";

import {
  handlePropChange,
  handlePlayerPosition,
  handleSceneLoaded
}
from "../features/player/playerHandler.js";

import {
  handlePlayerHit
}
from "../features/combat/combatHandler.js";

const handlers = {

  guest_login: handleGuestLogin,

  start_matchmaking: startMatchmaking,

  cancel_matchmaking: cancelMatchmaking,

  prop_change: handlePropChange,

  player_position: handlePlayerPosition,

  scene_loaded: handleSceneLoaded,

  player_hit: handlePlayerHit

};

export default async function handleSocketEvent(
  ws,
  type,
  data
) {

  const handler = handlers[type];

  if (!handler) {

    console.warn("Unknown event:", type);

    return;

  }

  await handler(ws, data);

}