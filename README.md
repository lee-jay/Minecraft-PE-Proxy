Minecraft-PE-Proxy
==================

Proxy for Minecraft Pocket Edition to connect to internet servers without app modification

Requirements
============
Node.js
-------
Install node.js from http://nodejs.org/

Usage
=====
Downloading
-----------
Download and extract source using the ZIP button or this [link.](https://github.com/brandon15811/Minecraft-PE-Proxy/archive/master.zip)

Before first use
----------------
Install dependencies (Run in extracted directory)
```
npm install --production
```
Running the proxy
-----------------
```
node mcpeproxy.js --serverip <server ip>
```
Where `<server ip>` is the ip of the server to connect to
The ip will be saved into the config file
(Also can be specified via the environment variable "serverip")

More detailed documentation will be added when this is more complete
