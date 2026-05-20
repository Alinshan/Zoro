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
require('./events');
var currentVersion = "", versionCheckInterval = 180
var sock;


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
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error.output.statusCode !== 401);
      if (shouldReconnect) {
        console.log('Disconnected, reconnecting...');
        Primon();
      } else {
        console.log('QR code was not scanned.');
      }
    } else if (connection === 'open') {
      console.log('The connection is opened.');
      const usrId = sock.user.id;
      const mappedId = usrId.split(':')[0].split('@')[0] + `@s.whatsapp.net`;
      if (!global.similarity) global.similarity = await import('string-similarity-js');
      await sock.sendMessage(mappedId, { text: "_Zoro Online!_\n\n_Use_ ```" + global.handlers[0] + "menu``` _to see the list of commands._" });;
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