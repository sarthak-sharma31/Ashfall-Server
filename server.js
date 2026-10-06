// Must be the first import: ES modules run all imports before the rest of this file,
// so a later dotenv.config() call would load .env only after other modules had already read process.env.
import "dotenv/config";

import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

import { connectDB } from "./config/database.js";
import { PORT } from "./config/constants.js";

import initializeSocket from "./socket/socketHandler.js";

import healthRoute from "./routes/healthRoute.js";
import versionRoute from "./routes/versionRoute.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Which settings were found (names only, never values)
const envCheck = ["MONGODB_URI", "MONGO_URI", "GOOGLE_CLIENT_IDS", "MAX_PLAYERS", "LOBBY_DURATION", "HIDE_DURATION", "HUNT_DURATION"]
  .map((name) => `${name}=${process.env[name] ? "set" : "-"}`)
  .join("  ");
console.log("⚙️ Env:", envCheck);

connectDB();

app.use(express.json());
app.use("/patches", express.static(path.join(__dirname, "public/patches")));

app.use("/", healthRoute);
app.use("/", versionRoute);

initializeSocket(wss);

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
