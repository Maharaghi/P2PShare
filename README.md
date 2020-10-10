# P2PShare

This is a simple P2P file sharing program that uses WebRTC to communicate.  
It uses WebSockets as a signaling service to connect to other clients.  
This repo contains both a backend signaling server and the frontend.  
A live version can be found [here](https://p2pshare.herokuapp.com), hosted by heroku.

All you need to set this up is run
```
git clone https://github.com/Maharaghi/P2PShare.git
cd P2PShare
npm install
npm start
```
and it should run on localhost:3000 or whatever the environment variable PORT is set to.

This is just a simple thing I made to transfer files between friends without signing up for some site where you can upload files.
There aren't a lot of features in this, and connections are kind of janky sometimes. There are probably multiple bugs as well, so please keep that in mind.
