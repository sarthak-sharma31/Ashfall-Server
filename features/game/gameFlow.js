import {
  rooms,
  roomPhase,
  teams,
  alive,
  health,
  roundNumber,
  roundScores
} from "../../state/gameState.js";

import {
  LOBBY_DURATION,
  HIDE_DURATION,
  HUNT_DURATION,
  NEXT_ROUND_DELAY,
  MAX_ROUNDS
} from "../../config/constants.js";

import { broadcast } from "../../utils/socketUtils.js";

const roundTimers = {};

const seekerSpawns = [
  { x: 45, y: 1, z: 70 },
  { x: 47, y: 1, z: 70 },
  { x: 43, y: 1, z: 70 }
];

const hiderSpawns = [
  { x: 0, y: 1, z: 0 },
  { x: 4, y: 1, z: 0 },
  { x: -4, y: 1, z: 0 },
  { x: 0, y: 1, z: 4 },
  { x: 0, y: 1, z: -4 },
  { x: 6, y: 1, z: 6 }
];

export function startMatch(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.state === "playing") return;

  clearRoomTimers(roomId);

  room.state = "playing";
  roundNumber[roomId] = 1;
  roundScores[roomId] = {
    seekers: 0,
    hiders: 0
  };

  startLobby(roomId);
}

function startLobby(roomId) {
  const round = roundNumber[roomId] ?? 1;
  roomPhase[roomId] = "lobby";

  broadcast(roomId, "phase_update", {
    phase: "lobby",
    duration: LOBBY_DURATION,
    round
  });

  setRoomTimer(roomId, "lobby", () => {
    startHidePhase(roomId);
  }, LOBBY_DURATION);
}

function startHidePhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const round = roundNumber[roomId] ?? 1;
  assignTeams(roomId);

  room.players.forEach((playerId) => {
    alive[playerId] = true;
    health[playerId] = teams[playerId] === "hider" ? 200 : 150;

    broadcast(roomId, "team_assigned", {
      playerId,
      isBot: playerId.startsWith("bot_"),
      team: teams[playerId],
      position: getTeamSpawn(roomId, playerId)
    });
  });

  roomPhase[roomId] = "hide";

  broadcast(roomId, "phase_update", {
    phase: "hide",
    duration: HIDE_DURATION,
    round
  });

  setRoomTimer(roomId, "hide", () => {
    startHuntPhase(roomId);
  }, HIDE_DURATION);
}

function startHuntPhase(roomId) {
  const round = roundNumber[roomId] ?? 1;
  roomPhase[roomId] = "hunt";

  broadcast(roomId, "phase_update", {
    phase: "hunt",
    duration: HUNT_DURATION,
    round
  });

  setRoomTimer(roomId, "hunt", () => {
    endRound(roomId, "hiders");
  }, HUNT_DURATION);
}

function assignTeams(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (roundNumber[roomId] === 1) {
    const hiderCount = Math.ceil(room.players.length / 2);

    room.players.forEach((playerId, index) => {
      teams[playerId] = index < hiderCount ? "hider" : "seeker";
    });

    room.initialTeams = { ...teams };
    return;
  }

  room.players.forEach((playerId) => {
    const firstRoundTeam = room.initialTeams?.[playerId];
    teams[playerId] = firstRoundTeam === "hider" ? "seeker" : "hider";
  });
}

function getTeamSpawn(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return { x: 0, y: 1, z: 0 };

  const team = teams[playerId];
  const teamPlayers = room.players.filter(id => teams[id] === team);
  const index = Math.max(0, teamPlayers.indexOf(playerId));

  if (team === "seeker") {
    return seekerSpawns[index % seekerSpawns.length];
  }

  return hiderSpawns[index % hiderSpawns.length];
}

export function checkWin(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (roomPhase[roomId] !== "hunt") return;
  if (room.roundEnding) return;

  const aliveHiders = room.players.filter(
    playerId => teams[playerId] === "hider" && alive[playerId]
  );

  if (aliveHiders.length === 0) {
    endRound(roomId, "seekers");
  }
}

export function endRound(roomId, winner) {
  const room = rooms[roomId];
  if (!room || room.roundEnding) return;

  room.roundEnding = true;
  clearRoomTimer(roomId, "hunt");

  roundScores[roomId][winner]++;

  const round = roundNumber[roomId] ?? 1;

  broadcast(roomId, "round_end", {
    winner,
    seekerScore: roundScores[roomId].seekers,
    hiderScore: roundScores[roomId].hiders,
    round,
    nextRoundIn: NEXT_ROUND_DELAY
  });

  if (round >= MAX_ROUNDS) {
    setRoomTimer(roomId, "match_end", () => {
      endMatch(roomId);
    }, NEXT_ROUND_DELAY);
    return;
  }

  setRoomTimer(roomId, "next_round", () => {
    room.roundEnding = false;
    roundNumber[roomId] = round + 1;
    startHidePhase(roomId);
  }, NEXT_ROUND_DELAY);
}

function endMatch(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const scores = roundScores[roomId];
  const winner =
    scores.seekers > scores.hiders ? "seekers" :
    scores.hiders > scores.seekers ? "hiders" :
    "draw";

  broadcast(roomId, "match_end", {
    winner,
    seekerScore: scores.seekers,
    hiderScore: scores.hiders
  });

  room.state = "ended";
  clearRoomTimers(roomId);
}

function setRoomTimer(roomId, key, callback, seconds) {
  clearRoomTimer(roomId, key);
  roundTimers[roomId] ??= {};
  roundTimers[roomId][key] = setTimeout(callback, seconds * 1000);
}

function clearRoomTimer(roomId, key) {
  const timer = roundTimers[roomId]?.[key];
  if (timer) clearTimeout(timer);
  if (roundTimers[roomId]) delete roundTimers[roomId][key];
}

function clearRoomTimers(roomId) {
  Object.values(roundTimers[roomId] ?? {}).forEach(clearTimeout);
  roundTimers[roomId] = {};
}
