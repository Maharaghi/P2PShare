const bitrateDiv = document.querySelector('div#bitrate');
const fileInput = document.querySelector('input#fileInput');
const abortButton = document.querySelector('button#abortButton');
const downloadAnchor = document.querySelector('div#download');
const sendProgress = document.querySelector('progress#sendProgress');
const receiveProgress = document.querySelector('progress#receiveProgress');
const statusMessage = document.querySelector('span#status');
const sendFileButton = document.querySelector('button#sendFile');

export default class Peer {
  constructor (ws) {
    // this.config = { iceServers: [ { urls: [ 'stun:stun.l.google.com:19302' ] } ], iceTransportPolicy: 'all', iceCandidatePoolSize: '0' };
    this.config = {
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302'
        },
        {
          urls: 'stun:global.stun.twilio.com:3478?transport=udp'
        },
        {
          urls: 'turn:numb.viagenie.ca',
          credential: 'muazkh',
          username: 'webrtc@live.com'
        }
      ]
    };
    this.pc = new RTCPeerConnection(this.config);
    this._createIceListener();
    this.ws = ws;

    this.filedata = null;

    this.receiveBuffer = [];
    this.receivedSize = 0;

    this.bytesPrev = 0;
    this.timestampPrev = 0;
    this.timestampStart;
    this.statsInterval = null;
    this.bitrateMax = 0;

    // Update to properly handle aborting the file transfer
    abortButton.addEventListener('click', () => {
      if (this.fileReader && this.fileReader.readyState === 1) {
        console.log('Abort read!');
        this.fileReader.abort();
      }
    });

    this.pc.addEventListener('datachannel', this.receiveChannelCallback.bind(this));
  }

  _createIceListener () {
    this.pc.addEventListener('icecandidate', async (event) => {
      console.log('Local ICE candidate: ', event.candidate);
      if (event.candidate && this.ws && this.ws.OPEN) {
        this.ws.send(JSON.stringify({ type: 'candidate', data: event.candidate }));
      }
    });
  }

  createDataChannel () {
    this.sendChannel = this.pc.createDataChannel('sendDataChannel');
    this.sendChannel.binaryType = 'arraybuffer';

    this.sendChannel.addEventListener('open', this.onSendChannelStateChange.bind(this));
    this.sendChannel.addEventListener('close', this.onSendChannelStateChange.bind(this));
    this.sendChannel.addEventListener('error', (error) => console.error('Error in sendChannel:', error));
  }

  async createOffer () {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer (offer) {
    await this.pc.setRemoteDescription(offer);
    try {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      return answer;
    } catch (e) {
      console.log('Failed to create session description: ', e);
    }
  }

  async handleAnswer (answer) {
    await this.pc.setRemoteDescription(answer);
  }

  async gotLocalDescription (desc) {
    await this.pc.setLocalDescription(desc);
    return desc;
  }

  async gotRemoteDescription (desc) {
    await this.pc.setLocalDescription(desc);
    return desc;
  }

  setFileData (data) {
    this.filedata = data;
    const readyState = this.receiveChannel.readyState;
    console.log(`Receive channel state is: ${readyState}`);
    if (readyState === 'open') {
      let s = async () => {
        this.timestampStart = new Date().getTime();
        this.timestampPrev = this.timestampStart;
        this.statsInterval = setInterval(this.displayStats.bind(this), 500);
        await this.displayStats();
      };
      if (!this.statsInterval) {
        s();
      }
    }
  }

  receiveChannelCallback (event) {
    console.log('Receive Channel Callback');
    this.receiveChannel = event.channel;
    this.receiveChannel.binaryType = 'arraybuffer';
    this.receiveChannel.onmessage = this.onReceiveMessageCallback.bind(this);
    this.receiveChannel.onopen = this.onReceiveChannelStateChange.bind(this);
    this.receiveChannel.onclose = this.onReceiveChannelStateChange.bind(this);

    this.receivedSize = 0;
    this.bitrateMax = 0;
  }

  sendData () {
    const file = fileInput.files[0];
    console.log(`File is ${[ file.name, file.size, file.type, file.lastModified ].join(' ')}`);

    // Handle 0 size files.
    statusMessage.textContent = '';
    if (file.size === 0) {
      bitrateDiv.innerHTML = '';
      statusMessage.textContent = 'File is empty, please select a non-empty file';
      return;
    }

    if (this.ws.OPEN) {
      console.log('Sending file data');
      let f = Object.assign({}, { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
      this.ws.send(JSON.stringify({ type: 'filedata', data: f }));
    }

    sendProgress.max = file.size;
    // const chunkSize = 16384;
    const chunkSize = 262144;
    this.fileReader = new FileReader();
    let offset = 0;
    this.fileReader.addEventListener('error', (error) => console.error('Error reading file:', error));
    this.fileReader.addEventListener('abort', (event) => console.log('File reading aborted:', event));
    this.fileReader.addEventListener('load', (e) => {
      // console.log('FileRead.onload ', e);
      this.sendChannel.send(e.target.result);
      // this.sendChannel.onbufferedamountlow = (e) => console.log('Buffered Low Amount', e);
      offset += e.target.result.byteLength;
      sendProgress.value = offset;
      if (offset < file.size) {
        readSlice(offset);
      } else {
        fileInput.disabled = false;
        abortButton.disabled = true;
        sendFileButton.disabled = false;

        if (this.statsInterval) {
          clearInterval(this.statsInterval);
          this.statsInterval = null;
        }

        this.bytesPrev = 0;
        this.timestampPrev = 0;
        this.timestampStart = 0;
        this.bitrateMax = 0;
      }
    });
    const readSlice = (o) => {
      console.log('readSlice ', o);
      const slice = file.slice(offset, o + chunkSize);
      this.fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);

    const readyState = this.sendChannel.readyState;
    if (readyState === 'open') {
      this.timestampStart = new Date().getTime();
      this.timestampPrev = this.timestampStart;
      const s = () => this.displayStats(true);
      this.statsInterval = setInterval(s.bind(this), 500);
      const s2 = async () => await this.displayStats(true);
      s2();
    }
  }

  onReceiveMessageCallback (event) {
    console.log(`Received Message ${event.data.byteLength}`);
    this.receiveBuffer.push(event.data);
    this.receivedSize += event.data.byteLength;

    receiveProgress.value = this.receivedSize;

    // we are assuming that our signaling protocol told
    // about the expected file size (and name, hash, etc).
    const file = this.filedata;
    if (!file) return;

    if (receiveProgress.max !== file.size) {
      receiveProgress.max = file.size;
    }

    if (this.receivedSize === file.size) {
      const received = new Blob(this.receiveBuffer);
      this.receiveBuffer = [];

      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(received);
      anchor.download = file.name;
      anchor.textContent = `Click to download '${file.name}' (${file.size} bytes)`;
      anchor.style.display = 'block';
      downloadAnchor.appendChild(anchor);

      const bitrate = Math.round(this.receivedSize / (new Date().getTime() - this.timestampStart));
      bitrateDiv.innerHTML = `<strong>Average Bitrate:</strong> ${bitrate} kb/sec (max: ${this.bitrateMax} kb/sec)`;

      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      this.filedata = null;

      this.receiveBuffer = [];
      this.receivedSize = 0;

      this.bytesPrev = 0;
      this.timestampPrev = 0;
      this.timestampStart = 0;
      this.bitrateMax = 0;

      // this.closeDataChannels();
    }
  }

  closeDataChannels () {
    console.log('Closing data channels');
    if (this.sendChannel) {
      this.sendChannel.close();
      console.log(`Closed data channel with label: ${this.sendChannel.label}`);
    }
    if (this.receiveChannel) {
      this.receiveChannel.close();
      console.log(`Closed data channel with label: ${this.receiveChannel.label}`);
    }

    this.pc.close();
    console.log('Closed peer connection');

    // Reset peer connection
    this.pc = new RTCPeerConnection();
    this._createIceListener();

    // re-enable the file select
    fileInput.disabled = false;
    abortButton.disabled = true;
    sendFileButton.disabled = false;
  }

  async onReceiveChannelStateChange () {
    const readyState = this.receiveChannel.readyState;
    console.log(`Receive channel state is: ${readyState}`);
    if (readyState === 'open') {
      this.timestampStart = new Date().getTime();
      this.timestampPrev = this.timestampStart;
      const s = () => this.displayStats(false);
      this.statsInterval = setInterval(s.bind(this), 500);
      await this.displayStats(false);
    }
  }

  onSendChannelStateChange () {
    const readyState = this.sendChannel.readyState;
    console.log(`Send channel state is: ${readyState}`);
    if (readyState === 'open') {
      this.sendData();
    }
  }

  async displayStats (sending = false) {
    if (this.pc && this.pc.iceConnectionState === 'connected') {
      const stats = await this.pc.getStats();
      let activeCandidatePair;
      stats.forEach((report) => {
        if (report.type === 'data-channel' && report.label === 'sendDataChannel') {
          activeCandidatePair = report;
        }
      });
      console.log('Displaying stats', activeCandidatePair);
      if (activeCandidatePair) {
        if (this.timestampPrev === activeCandidatePair.timestamp) {
          return;
        }
        // calculate current bitrate

        let bytesNow;
        if (sending) bytesNow = activeCandidatePair.bytesSent;
        else bytesNow = activeCandidatePair.bytesReceived;

        const bitrate = Math.round((bytesNow - this.bytesPrev) / (activeCandidatePair.timestamp - this.timestampPrev));
        bitrateDiv.innerHTML = `<strong>Current Bitrate:</strong> ${bitrate} kb/sec (max: ${this.bitrateMax} kb/sec)`;
        this.timestampPrev = activeCandidatePair.timestamp;
        this.bytesPrev = bytesNow;
        if (bitrate > this.bitrateMax) {
          this.bitrateMax = bitrate;
        }
      }
    }
  }
}
