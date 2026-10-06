export function generateUID() {

  return Math.floor(
    100000000000 +
    Math.random() * 900000000000
  ).toString();

}

export function isBot(playerId) {

  return playerId.startsWith("bot_");

}