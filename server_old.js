import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";
import { connectDB } from "./database.js";
import Player from "./models/Player.js";

connectDB();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;
const MAX_PLAYERS = 6;
const BOT_FILL_DELAY = 5000; // 10 seconds before filling with bots

/* -----------------------------
   GAME STATE
------------------------------ */

const rooms = {};
const roomPhase = {};
const currentProp = {};
const alive = {};
const teams = {};
const playerState = {};
const clients = new Map();
const roomReady = {};
const health = {};
const roundNumber = {};
const roundScores = {};
const botIds = {};

let matchmakingQueue = [];
let matchmakingTimer = null;

function generateUID() {
  return Math.floor(
    100000000000 + Math.random() * 900000000000
  ).toString();
}

/* -----------------------------
   HELPERS
------------------------------ */

function send(ws, type, data = {}) {
  ws.send(JSON.stringify({ type, data }));
}

function broadcast(roomId, type, data = {}) {
  for (const [ws, client] of clients.entries()) {
    if (client.roomId === roomId) {
      send(ws, type, data);
    }
  }
}

function isBot(playerId) {
  return playerId.startsWith("bot_");
}

/* -----------------------------
   WEBSOCKET
------------------------------ */

wss.on("connection", (ws) => {
  const playerId = crypto.randomUUID();

  clients.set(ws, { playerId, roomId: null });

  console.log("🟢 Player connected:", playerId);
  send(ws, "connected", { playerId });

  ws.on("message", async(raw) => {
    const { type, data } = JSON.parse(raw || "{}");
    const client = clients.get(ws);
    if (!client) return;

    if (type === "guest_login") {

      let player;

      // EXISTING ACCOUNT
      if (data?.uid) {

        player = await Player.findOne({
          uid: data.uid
        });

      }

      // CREATE NEW ACCOUNT
      if (!player) {

        const uid = generateUID();

        player = await Player.create({
          uid,
          username: "Guest_" + uid.slice(-4)
        });

        console.log("✅ New guest account created:", uid);
      }

      // SEND PLAYER DATA
      send(ws, "login_success", {
        uid: player.uid,
        username: player.username,
        level: player.level,
        xp: player.xp,
        gold: player.gold,
        gems: player.gems,
        tickets: player.tickets,
        character: player.character
      });
    }

    /* -------- MATCHMAKING -------- */
    if (type === "start_matchmaking") {
      if (matchmakingQueue.some(p => p.playerId === playerId)) return;

      matchmakingQueue.push({
        playerId,
        ws,
        loadout: {
          character: data.character,
          primary: data.primary,
          secondary: data.secondary
        }
      });

      console.log("🎮 Queued:", playerId);

      // Start bot fill timer on first player joining
      if (matchmakingQueue.length === 1) {
        if (matchmakingTimer) clearTimeout(matchmakingTimer);

        matchmakingTimer = setTimeout(() => {
          if (matchmakingQueue.length > 0) {
            console.log("⏰ Bot fill timer fired");
            startPublicMatch(true); // true = fill with bots
          }
        }, BOT_FILL_DELAY);
      }

      // Start immediately if enough real players
      if (matchmakingQueue.length >= MAX_PLAYERS) {
        if (matchmakingTimer) clearTimeout(matchmakingTimer);
        startPublicMatch(false); // false = no bots needed
      }
    }

    if (type === "cancel_matchmaking") {
      matchmakingQueue = matchmakingQueue.filter(p => p.playerId !== playerId);
      console.log("❌ Cancelled matchmaking:", playerId);
    }

    /* -------- PROP CHANGE -------- */
    if (type === "prop_change") {
      currentProp[data.playerId || playerId] = data.prop;

      if (!client.roomId) return;

      broadcast(client.roomId, "prop_change", {
        playerId: data.playerId || playerId,
        prop: data.prop
      });
    }

    if (type === "prop_health_update") {
      const { playerId: targetId, maxHealth } = data;

      if (health[targetId] != null) {
        health[targetId] = maxHealth;
        console.log("Updated prop HP:", targetId, maxHealth);
      }
    }

    /* -------- SCENE LOADED -------- */
    if (type === "scene_loaded") {
      const roomId = client.roomId;
      if (!roomId) return;

      roomReady[roomId] ??= {};
      roomReady[roomId][playerId] = true;

      const room = rooms[roomId];
      if (!room) return;

      // Only wait for real players — bots are pre-marked ready
      const realPlayers = room.players.filter(p => !isBot(p));
      const allReady = realPlayers.every(p => roomReady[roomId][p]);

      if (allReady && room.state === "lobby") {
        startMatch(roomId);
      }
    }

    /* -------- POSITION UPDATE -------- */
    if (type === "player_position") {
      if (!client.roomId) return;

      const pid = data.playerId || playerId;

      playerState[pid] = {
        position: data.position,
        rotation: data.rotation,
        camPosition: data.camPosition,
        camRotation: data.camRotation
      };

      broadcast(client.roomId, "player_position", {
        playerId: pid,
        position: data.position,
        rotation: data.rotation,
        camPosition: data.camPosition,
        camRotation: data.camRotation
      });
    }

    /* -------- DECOY SPAWN -------- */
    if (type === "decoy_spawn") {
      const decoyId = crypto.randomUUID();

      broadcast(client.roomId, "decoy_spawned", {
        decoyId,
        ownerId: playerId,
        prop: data.prop,
        position: data.position,
        rotation: data.rotation
      });
    }

    /* -------- DECOY DESTROYED -------- */
    if (type === "decoy_destroyed") {
      broadcast(client.roomId, "decoy_destroyed", {
        decoyId: data.decoyId
      });
    }

    /* -------- WHISTLE -------- */
    if (type === "whistle") {
      broadcast(client.roomId, "whistle_sound", {
        position: data.position
      });
    }

    /* -------- PLAYER HIT -------- */
    if (type === "player_hit") {
      const { playerId: targetId, damage } = data;
      const roomId = client.roomId;

      if (health[targetId] == null) return;

      health[targetId] -= damage;
      health[targetId] = Math.max(health[targetId], 0);

      broadcast(roomId, "player_damaged", {
        playerId: targetId,
        health: health[targetId]
      });

      if (health[targetId] <= 0) {
        health[targetId] = 0;
        alive[targetId] = false;

        broadcast(roomId, "player_eliminated", {
          victimId: targetId,
          killerId: client.playerId
        });

        checkWin(roomId);
      }
    }
  });

  ws.on("close", () => {
    const { roomId } = clients.get(ws) || {};
    clients.delete(ws);

    matchmakingQueue = matchmakingQueue.filter(p => p.playerId !== playerId);

    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.players = room.players.filter(p => p !== playerId);

    delete roomReady[roomId]?.[playerId];
    delete teams[playerId];
    delete alive[playerId];
    delete health[playerId];

    if (room.players.filter(p => !isBot(p)).length === 0) {
      // All real players left — clean up room
      delete rooms[roomId];
      delete roomReady[roomId];
      delete botIds[roomId];
      console.log("🗑️ Room cleaned up:", roomId);
    }
  });
});

/* -----------------------------
   MATCHMAKING
------------------------------ */

function startPublicMatch(fillWithBots) {
  const roomId = "public";

  rooms[roomId] ??= {
    players: [],
    state: "lobby",
    playerLoadouts: {}
  };

  roomReady[roomId] ??= {};
  botIds[roomId] ??= [];

  const room = rooms[roomId];

  // Move all queued players into room
  const playersForMatch = matchmakingQueue.splice(0, matchmakingQueue.length);

  playersForMatch.forEach(p => {
    if (!room.players.includes(p.playerId)) {
      room.players.push(p.playerId);
      room.playerLoadouts[p.playerId] = p.loadout;

      const client = clients.get(p.ws);
      if (client) client.roomId = roomId;
    }
  });

  // Fill remaining slots with bots
  if (fillWithBots) {
    const botsNeeded = MAX_PLAYERS - room.players.length;

    for (let i = 0; i < botsNeeded; i++) {
      const botId = "bot_" + crypto.randomUUID();

      room.players.push(botId);
      room.playerLoadouts[botId] = {
        character: "DefaultSoldier",
        primary: "rifle",
        secondary: "pistol"
      };

      botIds[roomId].push(botId);
      roomReady[roomId][botId] = true; // bots are always scene-ready

      console.log("🤖 Bot added:", botId);
    }
  }

  console.log(`🏠 Room ${roomId} — Players: ${room.players.length} (${botIds[roomId].length} bots)`);

  const realPlayers = room.players.filter(p => !isBot(p));
  const hostId = realPlayers[0]; // first real player is host

  // Tell each real player individually whether they are host
  for (const [ws, client] of clients.entries()) {
    if (client.roomId === roomId) {
      send(ws, "room_updated", {
        isHost: client.playerId === hostId,
        botCount: botIds[roomId].length,
        botIds: botIds[roomId].join(",") // ✅ send as comma-separated string, not array
      });
    }
  }
}

/* -----------------------------
   MATCH FLOW
------------------------------ */

function startMatch(roomId) {
  const room = rooms[roomId];
  if (!room || room.state === "playing") return;

  room.state = "playing";
  roundNumber[roomId] = 1;
  roundScores[roomId] = { seekers: 0, hiders: 0 };
  roomPhase[roomId] = "lobby";

  // Spawn all players (real + bots) without teams
  room.players.forEach((pid, i) => {
    broadcast(roomId, "spawn_player", {
      playerId: pid,
      team: "none",
      position: { x: 100 + i * 2, y: 1, z: 105 },
      rotation: { x: 0, y: 0, z: 0 },
      character: room.playerLoadouts[pid]?.character || "DefaultSoldier",
      prop: null,
      isBot: isBot(pid)
    });
  });

  broadcast(roomId, "phase_update", {
    phase: "lobby",
    duration: 30,
    round: 1
  });

  setTimeout(() => startRound(roomId), 30000);
}

function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  roomPhase[roomId] = "hide";
  const rn = roundNumber[roomId];

  let hiders = [];
  let seekers = [];

  if (rn === 1) {
    const shuffled = [...room.players].sort(() => Math.random() - 0.5);
    const half = Math.floor(shuffled.length / 2);
    hiders = shuffled.slice(0, half);
    seekers = shuffled.slice(half);

    room.round1Hiders = hiders;
    room.round1Seekers = seekers;
  } else {
    hiders = room.round1Seekers;
    seekers = room.round1Hiders;
  }

  // Send phase first
  broadcast(roomId, "phase_update", {
    phase: "hide",
    duration: 30,
    round: rn
  });

  setTimeout(() => {
    hiders.forEach((pid, i) => {
      teams[pid] = "hider";
      alive[pid] = true;
      health[pid] = 200;

      if (rn === 1) {
        broadcast(roomId, "player_position", {
          playerId: pid,
          position: { x: 100 + i * 2, y: 1, z: 100 },
          rotation: { x: 0, y: 0, z: 0 },
          camPosition: { x: 100 + i * 2, y: 2, z: 100 },
          camRotation: { x: 0, y: 0, z: 0 }
        });

        broadcast(roomId, "team_assigned", {
          playerId: pid,
          team: "hider",
          position: { x: 100 + i * 2, y: 1, z: 100 },
          isBot: isBot(pid)
        });
      } else {
        broadcast(roomId, "spawn_player", {
          playerId: pid,
          team: "hider",
          position: { x: 100 + i * 2, y: 1, z: 100 },
          rotation: { x: 0, y: 0, z: 0 },
          character: room.playerLoadouts[pid]?.character || "DefaultSoldier",
          prop: currentProp[pid] || null,
          isBot: isBot(pid)
        });
      }
    });

    seekers.forEach((pid, i) => {
      teams[pid] = "seeker";
      alive[pid] = true;
      health[pid] = 150;

      if (rn === 1) {
        broadcast(roomId, "player_position", {
          playerId: pid,
          position: { x: 90 + i * 2, y: 1, z: 115 },
          rotation: { x: 0, y: 0, z: 0 },
          camPosition: { x: 90 + i * 2, y: 2, z: 115 },
          camRotation: { x: 0, y: 0, z: 0 }
        });

        broadcast(roomId, "team_assigned", {
          playerId: pid,
          team: "seeker",
          position: { x: 90 + i * 2, y: 1, z: 115 },
          isBot: isBot(pid)
        });
      } else {
        broadcast(roomId, "spawn_player", {
          playerId: pid,
          team: "seeker",
          position: { x: 90 + i * 2, y: 1, z: 115 },
          rotation: { x: 0, y: 0, z: 0 },
          character: room.playerLoadouts[pid]?.character || "DefaultSoldier",
          isBot: isBot(pid)
        });
      }
    });
  }, 500);

  setTimeout(() => startHunt(roomId), 30000);
}

function startHunt(roomId) {
  if (!rooms[roomId]) return;

  roomPhase[roomId] = "hunt";

  broadcast(roomId, "phase_update", {
    phase: "hunt",
    duration: 120,
    round: roundNumber[roomId]
  });

  setTimeout(() => {
    if (!rooms[roomId]) return;
    if (roomPhase[roomId] !== "hunt") return;

    endRound(roomId, "hiders");
  }, 120000);
}

function endRound(roomId, roundWinner) {
  const room = rooms[roomId];
  if (!room) return;

  roomPhase[roomId] = "between_rounds";
  roundScores[roomId][roundWinner]++;

  const rn = roundNumber[roomId];
  const scores = roundScores[roomId];

  if (rn === 1) {
    broadcast(roomId, "round_end", {
      round: 1,
      roundWinner,
      seekerScore: scores.seekers,
      hiderScore: scores.hiders,
      nextRoundIn: 5
    });

    roundNumber[roomId] = 2;
    setTimeout(() => startRound(roomId), 5000);
  } else {
    let matchWinner;
    if (scores.seekers > scores.hiders) matchWinner = "seekers";
    else if (scores.hiders > scores.seekers) matchWinner = "hiders";
    else matchWinner = "draw";

    broadcast(roomId, "match_end", {
      winner: matchWinner,
      seekerScore: scores.seekers,
      hiderScore: scores.hiders
    });
  }
}

function checkWin(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (roomPhase[roomId] !== "hunt") return;

  const aliveHiders = room.players.filter(
    p => teams[p] === "hider" && alive[p]
  );

  if (aliveHiders.length === 0) {
    endRound(roomId, "seekers");
  }
}

/* -----------------------------
   EXPRESS
------------------------------ */

app.get("/", (_, res) => {
  res.send("🟢 Prop Hunt Server Running");
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});