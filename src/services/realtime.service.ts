import { Request, Response } from 'express';

// Keeps track of all nurse clients connected to the SSE endpoint
let clients: { id: string; res: Response }[] = [];

export const streamEvents = (req: Request, res: Response) => {
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

export const broadcastUpdate = (type: string, data: any) => {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  });
};
