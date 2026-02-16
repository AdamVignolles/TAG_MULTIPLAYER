import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 3001 });

wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        // broadcast à tous les joueurs
        wss.clients.forEach(client => {
            client.send(data.toString());
        });
    });
});