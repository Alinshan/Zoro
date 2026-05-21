const Module = require('module');
const originalRequire = Module.prototype.require;
const execSync = require('child_process').execSync;
const fs = require('fs');
const { MongoClient } = require('mongodb');

let mongoClient, db, authCollection, configCollection;

const installedPackages = new Set();
Module.prototype.require = function (packageName) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && !packageName.startsWith('.')) {
      if (!installedPackages.has(packageName)) {
        console.log(`Package ${packageName} not found. Installing...`);

        const isTermux = process?.env?.PREFIX === '/data/data/com.termux/files/usr';

        try {
          execSync(`npm install ${packageName}`, { stdio: 'ignore' });
          installedPackages.add(packageName);

          return originalRequire.apply(this, arguments);
        } catch (installError) {
          if (isTermux) {
            console.log('⚠️ Termux detected. Skipping installation of unsupported ' + packageName + ' module. Some features may not work.');
          } else {
            console.error(`Package installation error: ${installError.message}`);
          }
        }
      }
    }
    throw err;
  }
};

let makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage;
const axios = require('axios');
const pino = require('pino');
const express = require('express');
const QRCode = require('qrcode');
require('./events');
var currentVersion = "", versionCheckInterval = 180
var sock;

// ── Web server for QR code scanning ─────────────────────────────────────────
let qrDataURL = null;
let botConnected = false;

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  const connectedHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zoro Bot — Connected</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0a0a0a; color: #fff;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #111; border: 1px solid #1f1f1f; border-radius: 20px;
            padding: 48px 40px; text-align: center; max-width: 480px; width: 100%;
            box-shadow: 0 0 60px rgba(34,197,94,0.15); }
    .logo { font-size: 52px; margin-bottom: 12px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
    h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.5px;
         background: linear-gradient(135deg,#22c55e,#16a34a); -webkit-background-clip:text;
         -webkit-text-fill-color:transparent; margin-bottom: 8px; }
    p { color: #6b7280; font-size: 15px; line-height: 1.6; margin-top: 10px; }
    .badge { display:inline-block; background:#052e16; color:#22c55e; font-size:13px;
             font-weight:600; padding:6px 16px; border-radius:999px; margin-top:20px;
             border:1px solid #166534; }
    .footer { color:#374151; font-size:12px; margin-top:28px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚔️</div>
    <h1>Zoro is Online!</h1>
    <p>The bot is connected and running. You can now use all commands in your WhatsApp groups.</p>
    <div class="badge">✅ Connected &amp; Running</div>
    <p class="footer">Zoro WhatsApp Bot &mdash; Built by Alinshan</p>
  </div>
</body>
</html>`;

  const qrHTML = (qr) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="30" />
  <title>Zoro Bot — Scan QR</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0a0a0a; color: #fff;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #111; border: 1px solid #1f1f1f; border-radius: 20px;
            padding: 40px 36px; text-align: center; max-width: 440px; width: 100%;
            box-shadow: 0 0 60px rgba(34,197,94,0.12); }
    .logo { font-size: 44px; margin-bottom: 10px; }
    h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.5px;
         background: linear-gradient(135deg,#22c55e,#16a34a); -webkit-background-clip:text;
         -webkit-text-fill-color:transparent; margin-bottom: 6px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .qr-wrap { background: #fff; border-radius: 16px; padding: 16px; display: inline-block; }
    .qr-wrap img { display: block; width: 240px; height: 240px; }
    .steps { text-align: left; margin-top: 28px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .step-num { background: #052e16; color: #22c55e; border: 1px solid #166534;
                border-radius: 50%; width: 26px; height: 26px; min-width: 26px;
                display: flex; align-items: center; justify-content: center;
                font-size: 12px; font-weight: 700; }
    .step-text { color: #9ca3af; font-size: 13px; line-height: 1.5; padding-top: 4px; }
    .refresh-note { color: #374151; font-size: 12px; margin-top: 20px; }
    .dot { display: inline-block; width: 8px; height: 8px; background: #22c55e;
           border-radius: 50%; margin-right: 6px;
           animation: blink 1.2s ease-in-out infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚔️</div>
    <h1>Connect Zoro Bot</h1>
    <p class="subtitle">Scan the QR code below with WhatsApp to link your number</p>
    <div class="qr-wrap">
      <img src="${qr}" alt="WhatsApp QR Code" />
    </div>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-text">Open WhatsApp on your phone</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Tap <strong>⋮ Menu &rarr; Linked Devices &rarr; Link a Device</strong></div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Point your camera at the QR code above</div></div>
    </div>
    <p class="refresh-note"><span class="dot"></span>Page auto-refreshes every 30s. QR expires in ~60s.</p>
  </div>
</body>
</html>`;

  const waitingHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="5" />
  <title>Zoro Bot — Starting...</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#0a0a0a; color:#fff;
           display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#111; border:1px solid #1f1f1f; border-radius:20px;
            padding:48px; text-align:center; max-width:420px; }
    .spinner { width:48px; height:48px; border:4px solid #1f2d1f;
               border-top-color:#22c55e; border-radius:50%;
               animation:spin 0.9s linear infinite; margin:0 auto 24px; }
    @keyframes spin { to { transform:rotate(360deg); } }
    h1 { font-size:22px; font-weight:700; color:#e5e7eb; margin-bottom:10px; }
    p  { color:#6b7280; font-size:14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Starting Zoro Bot...</h1>
    <p>Generating QR code, please wait. This page will refresh automatically.</p>
  </div>
</body>
</html>`;

  if (botConnected) return res.send(connectedHTML);
  if (qrDataURL) return res.send(qrHTML(qrDataURL));
  return res.send(waitingHTML);
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  
  // Keep-alive: Self-pinging to prevent Render free-tier from sleeping
  const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
  if (renderUrl) {
    console.log(`[Keep-Alive] Self-ping active for URL: ${renderUrl}`);
    setInterval(async () => {
      try {
        await axios.get(renderUrl);
        console.log(`[Keep-Alive] Pinged self successfully at: ${new Date().toISOString()}`);
      } catch (err) {
        console.error(`[Keep-Alive] Self-ping failed:`, err.message);
      }
    }, 5 * 60 * 1000); // Ping every 5 minutes (Render sleep timeout is 15 minutes)
  } else {
    console.log(`[Keep-Alive] No RENDER_EXTERNAL_URL or PUBLIC_URL environment variable found. Self-ping inactive.`);
  }
});
// ────────────────────────────────────────────────────────────────────────────


setInterval(async () => {
  fs.writeFileSync("./database.json", JSON.stringify(global.database, null, 2));
  if (configCollection && global.database) {
    try {
      await configCollection.replaceOne({ _id: 'database' }, { _id: 'database', data: global.database }, { upsert: true });
    } catch (e) {
      console.error("Error saving database to MongoDB", e);
    }
  }
  versionCheckInterval--
  if (versionCheckInterval <= 0) {
    try {
      var getLatestCommit = await axios.get("https://api.github.com/repos/Alinshan/Zoro/commits")

      if (currentVersion == "") {
        currentVersion = getLatestCommit.data[0].sha
      } else {
        if (getLatestCommit.data[0].sha != currentVersion) {
          currentVersion = getLatestCommit.data[0].sha
          await sock.sendMessage(sock.user.id, { image: { url: "./src/new_version.png" }, caption: "*🆕 New Version Available!*\n\n_Please update your bot via_ ```.update```" });
        }
      }
    } catch (e) {
      // Gracefully handle if the custom repo isn't published or reachable yet
    }
    versionCheckInterval = 180
  }
}, 5000);

/**
 * Configures the logger with the specified options.
 */
const logger = pino({
  level: "silent",
  customLevels: {
    trace: 10000,
    debug: 10000,
    info: 10000,
    warn: 10000,
    error: 10000,
    fatal: 10000,
  },
});



// ── Global error reporter → DMs error to bot's own number ────────────────────
global.reportError = async function(context, error) {
  const errText = `*⚠️ Zoro Error [${context}]*\n\n` +
                  `*Message:* ${error?.message || error}\n` +
                  `*Stack:* \`\`\`${String(error?.stack || '').slice(0, 600)}\`\`\``;
  console.error(`[${context}]`, error);
  try {
    if (sock?.user?.id) {
      const botDm = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      await sock.sendMessage(botDm, { text: errText });
    }
  } catch {}
};

async function Primon() {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  downloadContentFromMessage = baileys.downloadContentFromMessage;

  const { version } = await fetchLatestBaileysVersion();
  let state, saveCreds;

  if (process.env.MONGODB_URI) {
    console.log('Connecting to MongoDB for persistence...');
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db('zoro_bot');
    authCollection = db.collection('auth_state');
    configCollection = db.collection('config');

    // Load global.database from MongoDB if it exists
    const remoteConfig = await configCollection.findOne({ _id: 'database' });
    if (remoteConfig && remoteConfig.data) {
      global.database = remoteConfig.data;
      fs.writeFileSync("./database.json", JSON.stringify(global.database, null, 2));
    }

    const { useMongoDBAuthState } = require('./mongoAuth');
    const auth = await useMongoDBAuthState(authCollection);
    state = auth.state;
    saveCreds = auth.saveCreds;
  } else {
    const auth = await useMultiFileAuthState(__dirname + "/session/");
    state = auth.state;
    saveCreds = auth.saveCreds;
  }

  sock = makeWASocket({
    logger,
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    auth: state,
    version: version
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Capture QR code and convert to data URL for the web page
    if (qr) {
      try {
        qrDataURL = await QRCode.toDataURL(qr, { width: 480, margin: 2 });
        botConnected = false;
        console.log(`🔗 QR ready — scan at http://localhost:${PORT}`);
      } catch (e) { console.error('QR generation error:', e); }
    }

    if (connection === 'close') {
      qrDataURL = null;
      botConnected = false;
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== 401);
      if (shouldReconnect) {
        console.log('Disconnected, reconnecting...');
        Primon();
      } else {
        console.log('Session ended — please rescan the QR code.');
      }
    } else if (connection === 'open') {
      qrDataURL = null;
      botConnected = true;
      console.log('The connection is opened.');
      const usrId = sock.user.id;
      const mappedId = usrId.split(':')[0].split('@')[0] + `@s.whatsapp.net`;
      if (!global.similarity) global.similarity = await import('string-similarity-js');
      await sock.sendMessage(mappedId, { text: "_Zoro Online!_\n\n_Use_ ```" + global.handlers[0] + "menu``` _to see the list of commands._" });
    }
  });

  sock.ev.on("messages.upsert", async (msg) => {
    try {
      if (!msg.hasOwnProperty("messages") || msg.messages.length === 0) return;

      for (let m of msg.messages) {

        if (m.pushName) {
          const rawSender = m.key.participant || (m.key.fromMe ? sock.user.id : m.key.remoteJid);
          const sender = rawSender.split(':')[0].split('@')[0] + "@s.whatsapp.net";
          global.database.users[sender] = m.pushName;
        }
      }

      const rawMessage = structuredClone(msg);
      msg = msg.messages[0];
      const quotedMessage = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      msg.quotedMessage = quotedMessage;

      if ((msg.key && msg.key.remoteJid === "status@broadcast")) return;
      if (global.database.blacklist.includes(msg.key.remoteJid) && !msg.key.fromMe) return;

      if (msg.key.participant == undefined) {
        if (msg.key.fromMe == false) {
          msg.key.participant = msg.key.remoteJid
        } else {
          msg.key.participant = sock.user.id.split(':')[0].split('@')[0] + `@s.whatsapp.net` 
        }
      }

      if (global.database.afkMessage.active && (!msg.key.fromMe && !global.isSudo(msg.key.participant))) {
        if (msg.key.remoteJid.includes("@s.whatsapp.net")) {
          if (global.database.afkMessage.type == "text") {
            await sock.sendMessage(msg.key.remoteJid, { text: global.database.afkMessage.content });
          } else {
            var mediaPath = `./src/afk.${global.database.afkMessage.type}`;
            fs.writeFileSync(mediaPath, global.database.afkMessage.media, "base64");
            if (global.database.afkMessage.type == "video") {
              await sock.sendMessage(msg.key.remoteJid, { video: { url: mediaPath }, caption: global.database.afkMessage.content == "" ? undefined : global.database.afkMessage.content }, { quoted: rawMessage.messages[0] });
            } else {
              await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaPath }, caption: global.database.afkMessage.content == "" ? undefined : global.database.afkMessage.content }, { quoted: rawMessage.messages[0] });
            }
            try { fs.unlinkSync(mediaPath) } catch {}
            return;
          }
        } else {
          if (rawMessage.messages[0]?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id.split(':')[0] + `@s.whatsapp.net`)) {
            if (global.database.afkMessage.type == "text") {
              await sock.sendMessage(msg.key.remoteJid, { text: global.database.afkMessage.content }, { quoted: rawMessage.messages[0] });
            } else {
              var mediaPath = `./src/afk.${global.database.afkMessage.type}`;
              fs.writeFileSync(mediaPath, global.database.afkMessage.media, "base64");
              if (global.database.afkMessage.type == "video") {
                await sock.sendMessage(msg.key.remoteJid, { video: { url: mediaPath }, caption: global.database.afkMessage.content == "" ? undefined : global.database.afkMessage.content }, { quoted: rawMessage.messages[0] });
              } else {
                await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaPath }, caption: global.database.afkMessage.content == "" ? undefined : global.database.afkMessage.content }, { quoted: rawMessage.messages[0] });
              }
              try { fs.unlinkSync(mediaPath) } catch {}
              return;
            }
          }
          if (rawMessage.messages[0]?.message?.extendedTextMessage?.contextInfo?.participant == sock.user.id.split(':')[0] + `@s.whatsapp.net`) {
            if (global.database.afkMessage.type == "text") {
              await sock.sendMessage(msg.key.remoteJid, { text: global.database.afkMessage.content });
            } else {
              var mediaPath = `./src/afk.${global.database.afkMessage.type}`;
              fs.writeFileSync(mediaPath, global.database.afkMessage.media, "base64");
              if (global.database.afkMessage.type == "video") {
                await sock.sendMessage(msg.key.remoteJid, { video: { url: mediaPath }, caption: global.database.afkMessage.content == "" ? undefined : global.database.afkMessage.content });
              } else {
                await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaPath }, caption: global.database.afkMessage.content == "" ? undefined : global.database.afkMessage.content });
              }
              try { fs.unlinkSync(mediaPath) } catch {}
              return;
            }
          }
        }
        return;
      }

      await start_command(msg, sock, rawMessage);

    } catch (error) {
      await global.reportError('command-handler', error);
    }
  });

  sock.ev.on("group-participants.update", async (participant) => {
    if (global.database.blacklist.includes(participant.id)) return;
    
    const mentions = participant.participants;
    const mentionText = mentions.map(p => `@${p.split('@')[0]}`).join(', ');

    if (participant.action === 'add') {
      const welcomeMessage = global.database.welcomeMessage.find(welcome => welcome.chat === participant.id);
      if (welcomeMessage) {
        let content = welcomeMessage.content || "";
        if (content.includes('@user')) {
          content = content.replace(/@user/g, mentionText);
        } else if (content) {
          content = `${content}\n\n${mentionText}`;
        } else {
          content = mentionText;
        }

        const mediaPath = `./welcome.${welcomeMessage.type}`;
        if (['image', 'video'].includes(welcomeMessage.type)) {
          fs.writeFileSync(mediaPath, welcomeMessage.media, "base64");
          const messageOptions = {
            [welcomeMessage.type]: { url: mediaPath },
            caption: content || undefined,
            mentions: mentions
          };
          await sock.sendMessage(participant.id, messageOptions);
        } else {
          await sock.sendMessage(participant.id, { text: content, mentions: mentions });
        }
      }
    } else if (participant.action === 'remove') {
      const goodbyeMessage = global.database.goodbyeMessage.find(goodbye => goodbye.chat === participant.id);
      if (goodbyeMessage) {
        let content = goodbyeMessage.content || "";
        if (content.includes('@user')) {
          content = content.replace(/@user/g, mentionText);
        } else if (content) {
          content = `${content}\n\n${mentionText}`;
        } else {
          content = mentionText;
        }

        const mediaPath = `./goodbye.${goodbyeMessage.type}`;
        if (['image', 'video'].includes(goodbyeMessage.type)) {
          fs.writeFileSync(mediaPath, goodbyeMessage.media, "base64");
          const messageOptions = {
            [goodbyeMessage.type]: { url: mediaPath },
            caption: content || undefined,
            mentions: mentions
          };
          await sock.sendMessage(participant.id, messageOptions);
        } else {
          await sock.sendMessage(participant.id, { text: content, mentions: mentions });
        }
      }
    }
  })



  sock.ev.on('creds.update', saveCreds)

  loadModules(__dirname + "/modules");
}

/**
 * Loads and requires all JavaScript modules from the specified directory path.
 *
 * @param {string} modulePath - The directory path where the modules are located.
 */

function loadModules(modulePath, logger = true, refresh = false) {
  fs.readdirSync(modulePath).forEach((file) => {
    if (file.endsWith(".js")) {
      if (refresh) {
        try { delete require.cache[require.resolve(`${modulePath}/${file}`)]; } catch {}
        logger ? console.log(`Reloading plugin: ${file}`) : null;
      } else {
        logger ? console.log(`Loading plugin: ${file}`) : null;
      }
      try {
        require(`${modulePath}/${file}`);
      } catch (err) {
        console.error(`Error loading plugin ${file}:`, err);
      }
    }
  });
}
global.loadModules = loadModules;
Primon();

/**
 * Downloads media from a WhatsApp message and saves it to the specified file path.
 *
 * @param {Object} message - The WhatsApp message object containing the media.
 * @param {string} type - The type of the media (e.g. "image", "video", "document").
 * @param {string} filepath - The file path to save the downloaded media.
 * @returns {Promise<void>} - A Promise that resolves when the media has been downloaded and saved.
 */
global.downloadMedia = async (message, type, filepath) => {
  const stream = await downloadContentFromMessage(
    {
      url: message.url,
      directPath: message.directPath,
      mediaKey: message.mediaKey,
    },
    type
  );

  const writeStream = fs.createWriteStream(filepath);
  const { pipeline } = require("stream/promises");
  await pipeline(stream, writeStream);
};

global.addExif = async function(webpPath, packname, author) {
  try {
      const webp = require('node-webpmux');
      const img = new webp.Image();
      await img.load(webpPath);
      const json = {
          "sticker-pack-id": "zoro-bot-" + Date.now(),
          "sticker-pack-name": "",
          "sticker-pack-publisher": author,
          "emojis": ["⚔️"]
      };
      const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
      const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
      const exif = Buffer.concat([exifAttr, jsonBuff]);
      exif.writeUIntLE(jsonBuff.length, 14, 4);
      img.exif = exif;
      await img.save(webpPath);
  } catch (e) {
      console.error("Error adding EXIF:", e);
  }
};/**
 * Checks if the number is an admin in the group.
 *
 * @param {Object} msg - The message object.
 * @param {Object} sock - The WhatsApp socket object.
 * @param {string} groupId - The ID of the group to check.
 * @param {string|boolean} number - Optional number. If false, the bot's own number is used.
 * @returns {Promise<boolean>} - Returns true if the bot is an admin, otherwise false.
 */

function normalizeJid(jid) {
  if (!jid) return '';
  const parts = jid.split('@');
  if (parts.length < 2) return jid;
  const user = parts[0].split(':')[0];
  const domain = parts[1];
  return `${user}@${domain}`;
}

global.checkAdmin = async function (msg, sock, groupId, number = false) {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    let target = number ? number : sock.user.id;
    const targetNormalized = normalizeJid(target);
    const targetLidNormalized = (!number && sock.user.lid) ? normalizeJid(sock.user.lid) : null;
    
    console.log(`[checkAdmin] Checking target: ${targetNormalized} (LID: ${targetLidNormalized}) in group: ${groupId}`);
    
    return groupMetadata.participants.some(participant => {
      const pNormalized = normalizeJid(participant.id);
      const match = (pNormalized === targetNormalized || (targetLidNormalized && pNormalized === targetLidNormalized)) && 
                    (participant.admin === 'admin' || participant.admin === 'superadmin');
      if (match) {
        console.log(`[checkAdmin] Match found: participant ${participant.id} is admin role: ${participant.admin}`);
      }
      return match;
    });
  } catch (error) {
    console.error("An error occurred while checking admin status: ", error);
    return false;
  }
};

global.getAdmins = async function (groupId) {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    const admins = groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
    
    // Add custom helper function to the returned array so .includes works robustly
    admins.includes = function(jid) {
      if (!jid) return false;
      const targetNormalized = normalizeJid(jid);
      return this.some(a => normalizeJid(a) === targetNormalized);
    };
    
    return admins;
  } catch (error) {
    console.error("An error occurred while getting admin list: ", error);
    const emptyArray = [];
    emptyArray.includes = () => false;
    return emptyArray;
  }
};

global.getAdminDiagnostics = async function (sock, groupId, senderJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    const botPn = sock.user.id;
    const botLid = sock.user.lid || 'None';
    
    let diag = `*📊 Zoro Admin Diagnostic Report*\n\n`;
    diag += `*🤖 Bot Identifiers:*\n`;
    diag += `• Phone JID: \`${botPn}\`\n`;
    diag += `• LID JID: \`${botLid}\`\n\n`;
    
    diag += `*👤 Sender Identifiers:*\n`;
    diag += `• Sender JID: \`${senderJid}\`\n\n`;
    
    diag += `*👥 Group Participants List:*\n`;
    const participants = groupMetadata.participants;
    if (participants.length === 0) {
      diag += `• _No participants found in group metadata!_\n`;
    } else {
      participants.forEach(p => {
        if (p.admin === 'admin' || p.admin === 'superadmin') {
          diag += `• JID: \`${p.id}\` (Role: *${p.admin}*)\n`;
        } else {
          // Only list non-admins if they match the bot or sender JIDs to keep text short
          const pNorm = normalizeJid(p.id);
          const isBot = pNorm === normalizeJid(botPn) || (botLid && pNorm === normalizeJid(botLid));
          const isSender = pNorm === normalizeJid(senderJid);
          if (isBot || isSender) {
            diag += `• JID: \`${p.id}\` (Role: _Member_)\n`;
          }
        }
      });
    }
    
    return diag;
  } catch (error) {
    return `❌ Diagnostic failed: ${error.message}`;
  }
};

/**
 * Downloads the contents of the given URL as an arraybuffer.
 *
 * @param {string} url - The URL to download.
 * @returns {Promise<ArrayBuffer>} - A Promise that resolves to the arraybuffer, or an empty string if the download fails.
 */
global.downloadarraybuffer = async function (url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return response.data;
  } catch (error) {
    return ""
  }
}

Object.defineProperty(global, "sock", {
  get: function () {
    return sock;
  },
  set: function (newSock) {
    sock = newSock;
  },
  configurable: true
});