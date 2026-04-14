import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import express from "express";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certPath = path.resolve(__dirname, "certs/server.cert");
const keyPath = path.resolve(__dirname, "certs/server.key");

const server = https.createServer(
  {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  },
  app,
);

const wss = new WebSocketServer({ server });

wss.on("connection", function connection(ws) {
  console.log("Secure client connected");
  ws.on("message", function incoming(message) {
    console.log("received: %d bytes", message.length);
  });

  ws.on("close", () => console.log("Client disconnected"));
});

app.get("/", (req, res) => {
  res.send("Hello, secure world!");
});

server.listen(8080, () => {
  console.log("Listening on https://localhost:8080");
});
