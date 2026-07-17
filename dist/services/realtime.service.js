"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastUpdate = exports.streamEvents = void 0;
// Keeps track of all nurse clients connected to the SSE endpoint
let clients = [];
const streamEvents = (req, res) => {
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);
    const clientId = Date.now().toString();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);
    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
    });
};
exports.streamEvents = streamEvents;
const broadcastUpdate = (type, data) => {
    clients.forEach(client => {
        client.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    });
};
exports.broadcastUpdate = broadcastUpdate;
