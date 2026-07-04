// from docs

import dotenv from "dotenv";

import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
dotenv.config();

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

connectDB();

app.use(express.json());
app.use("/patches", express.static(path.join(__dirname, "public/patches")));

app.use("/", healthRoute);
app.use("/", versionRoute);

initializeSocket(wss);

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});