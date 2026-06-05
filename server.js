import dotenv from "dotenv";

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
dotenv.config();

import { connectDB } from "./config/database.js";
import { PORT } from "./config/constants.js";

import initializeSocket from "./socket/socketHandler.js";

import healthRoute from "./routes/healthRoute.js";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

connectDB();

app.use(express.json());

app.use("/", healthRoute);

initializeSocket(wss);

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});