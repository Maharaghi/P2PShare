import Peer from './peer.js';

let localConnection;
let hasClient = false;

const host = `${window.location.protocol.endsWith('s') ? 'wss' : 'ws'}://${window.location.host}`;
const fileInput = document.querySelector('input#fileInput');
const abortButton = document.querySelector('button#abortButton');
const sendFileButton = document.querySelector('button#sendFile');
const myID = document.querySelector('#myID');
const targetID = document.querySelector('#connectedID');
const connectButton = document.querySelector('button#connectButton');
const connectID = document.querySelector('input#idInput');

console.log(host);

const ws = new WebSocket(host);

ws.addEventListener('open', () => {
  console.log('WS CONNECTED');
});

ws.addEventListener('close', () => {
  console.log('WS DISCONNECTED');
});

ws.addEventListener('message', async (msg) => {
  let message;
  try {
    message = JSON.parse(msg.data);
  } catch (e) {
    console.log('Could not parse received message', message);
    return;
  }
  if (!localConnection || !message) return;
  if (message.type === 'offer') {
    const answer = await localConnection.createAnswer(message.data);
    ws.send(JSON.stringify({ type: 'answer', data: answer }));
  } else if (message.type === 'answer') {
    await localConnection.handleAnswer(message.data);
  } else if (message.type === 'candidate') {
    await localConnection.pc.addIceCandidate(message.data);
  } else if (message.type === 'filedata') {
    localConnection.setFileData(message.data);
  } else if (message.type === 'connected') {
    console.log('Client with id', message.data, 'has connected to you');
    targetID.textContent = 'Connected ID: ' + message.data;
    hasClient = true;
  } else if (message.type === 'error') {
    console.error(message.data);
  } else if (message.type === 'id') {
    myID.textContent = 'My ID: ' + message.data;
  } else if (message.type === 'disconnected') {
    localConnection.closeDataChannels();
    console.log('Client with id', message.data, 'has disconnected');
    targetID.textContent = 'Connected ID: ';
  }
});

localConnection = new Peer(ws);
console.log('Created local peer connection object localConnection');

localConnection.pc.onicegatheringstatechange = (e) => console.log(e);
localConnection.pc.onicecandidateerror = (e) => console.error(e);

connectID.value = '';

sendFileButton.addEventListener('click', () => createConnectionWS());
fileInput.addEventListener('change', handleFileInputChange, false);

connectButton.addEventListener('click', (e) => {
  if (ws.OPEN && connectID.value) {
    ws.send(JSON.stringify({ type: 'connect', data: connectID.value }));
  }
});

async function handleFileInputChange () {
  const file = fileInput.files[0];
  if (!file) {
    console.log('No file chosen');
  } else {
    sendFileButton.disabled = false;
  }
}

async function createConnectionWS () {
  if (!hasClient) return;

  abortButton.disabled = false;
  sendFileButton.disabled = true;

  if (!localConnection.sendChannel || localConnection.sendChannel.readyState !== 'open') {
    localConnection.createDataChannel();
    console.log('Created send data channel');
    const offer = await localConnection.createOffer();
    if (ws.OPEN) {
      ws.send(JSON.stringify({ type: 'offer', data: offer }));
    }
  } else if (localConnection.sendChannel.readyState === 'open') {
    localConnection.sendData();
  }

  fileInput.disabled = true;
}
