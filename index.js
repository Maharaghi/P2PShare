const SocketServer = require('ws').Server;
// const { ExpressPeerServer } = require('peer');
const { v4 } = require('uuid');
const express = require('express');

const port = process.env.PORT || 3000;
const app = express();

app.use(express.static('public'));

const server = app.listen(port, () => console.log(`Listening on ${port}`));

// const peerServer = ExpressPeerServer(server, {
//   debug: false
// });

// peerServer.on('connection', (c) => {
//   console.log('Got connection on peerserver');
// });

// app.use('/ws', peerServer);

const wss = new SocketServer({ server });
let clients = {};
wss.on('connection', function connection (ws) {
  console.log('New connection');
  let id = v4().slice(0, 8);
  while (clients[id]) id = v4().slice(0, 8);
  clients[id] = ws;
  ws.client = null;

  console.log('Sending ID');
  ws.send(JSON.stringify({ type: 'id', data: id }));

  function closeRemote () {
    if (ws.client) {
      try {
        console.log('Attempting to remove connected client');
        ws.client.send(JSON.stringify({ type: 'disconnected', data: id }));
        if (ws.client.client === ws) {
          ws.client.client = null;
        }
      } catch (e) {}
    }
  }

  ws.on('close', () => {
    closeRemote();
    delete clients[id];
  });

  ws.on('message', (msg) => {
    let m;
    try {
      m = JSON.parse(msg);
    } catch (e) {
      console.error('Could not parse json from message', m);
    }
    // console.log(msg, client);
    if (m.type === 'connect') {
      if (ws.client && ws.client === clients[m.data]) {
        console.log('User was already connected to this client, stopping connection');
        return;
      }
      closeRemote();
      ws.client = clients[m.data];
      if (!ws.client) {
        ws.client = null;
        return ws.send(JSON.stringify({ type: 'error', data: "That client is doesn't exist" }));
      } else if (ws.client.client) {
        ws.client = null;
        return ws.send(JSON.stringify({ type: 'error', data: 'That client is already connected to someone' }));
      }
      ws.client.client = ws;
      ws.client.send(JSON.stringify({ type: 'connected', data: id }));
      ws.send(JSON.stringify({ type: 'connected', data: m.data }));
    } else if (ws.client) {
      ws.client.send(msg);
    }
  });
});
