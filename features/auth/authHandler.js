import Player from "../../models/Player.js";

import { send } from "../../utils/socketUtils.js";

import { generateUID } from "../../utils/helpers.js";

export default async function handleGuestLogin(ws, data) {

  let player;

  // Existing account
  if (data?.uid) {

    player = await Player.findOne({
      uid: data.uid
    });

  }

  // Create new guest account
  if (!player) {

    const uid = generateUID();

    player = await Player.create({
      uid,
      username: "Guest_" + uid.slice(-4)
    });

    console.log("✅ New guest account created:", uid);

  }

  send(ws, "login_success", {
    uid: player.uid,
    username: player.username,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    gems: player.gems,
    tickets: player.tickets,
    character: player.character,
    joined: player.createdAt?.toISOString?.() ?? "",
    kills: player.kills ?? 0,
    deaths: player.deaths ?? 0,
    matchesPlayed: player.matchesPlayed ?? 0,
    wins: player.wins ?? 0
  });

}
