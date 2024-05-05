import fs from 'fs';
import https from 'https';
import WebSocket, { WebSocketServer } from 'ws';
import express from 'express'

const app = express();

const server = https.createServer({
  cert: fs.readFileSync('server.cert'),
  key: fs.readFileSync('server.key')
}, app);

const wss = new WebSocketServer({ server });

wss.on('connection', function connection(ws) {
  console.log('Secure client connected');
  ws.on('message', function incoming(message) {
    console.log('received: %d bytes', message.length);
  });

  ws.on('close', () => console.log('Client disconnected'));
});

app.get('/', (req, res) => {
  res.send('Hello, secure world!');
});

server.listen(8080, () => {
  console.log('Listening on https://localhost:8080');
});
