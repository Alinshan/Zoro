const fs = require('fs');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { MongoClient } = require('mongodb');
var openedSocket = false;
var chat_count = 0;
try { fs.rmSync('./session', { recursive: true, force: true }); } catch {}
try { fs.rmSync('./.started', { recursive: true, force: true }); } catch {}
var countdown = Math.max(150, chat_count * 5);

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


const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

console.clear();
rl.question("Login with QR code (1) or Phone Number (2)\n\n⚠️  Logging with phone number is not recommend! :: ", async (answer) => {
  console.clear();
  rl.question("Is there any other device in WhatsApp? (y/n)\n\n >> ", async (answer2) => {
    console.clear();
    if (answer2 == "y") {
      console.clear();
      console.log("Please logout from all devices before logging in.");
      process.exit(1);
    } else if (answer2 == "n") {
      console.clear();
      if (answer == "2") {
        rl.question("Enter your phone number. Example: 905123456789\n\n >> ", async (number) => {
          await loginWithPhone(number);
        }); 
      } else if (answer == "1") {
        genQR(true);
      }
    }
  });
  
});

async function genQR(qr) {
  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = await import('@whiskeysockets/baileys');
  let { version } = await fetchLatestBaileysVersion();
  let state, saveCreds;

  if (process.env.MONGODB_URI) {
    if (!mongoClient) {
        mongoClient = new MongoClient(process.env.MONGODB_URI);
        await mongoClient.connect();
        db = mongoClient.db('zoro_bot');
        authCollection = db.collection('auth_state');
    }
    const { useMongoDBAuthState } = require('./mongoAuth');
    const auth = await useMongoDBAuthState(authCollection);
    state = auth.state;
    saveCreds = auth.saveCreds;
  } else {
    const auth = await useMultiFileAuthState('./session/');
    state = auth.state;
    saveCreds = auth.saveCreds;
  }
  let sock = makeWASocket({
    logger,
    auth: state,
    version: version,
    getMessage: async (key) => {},
  });
  if (!qr && !sock.authState.creds.registered) {
    console.log("You must use QR code to login.");
    process.exit(1);
  }
  
  sock.ev.on('connection.update', async (update) => {
    let { connection, qr: qrCode } = update;
    if (qrCode) {
      qrcode.generate(qrCode, { small: true });
    }
    if (connection === "connecting") {
      console.log("Connecting to WhatsApp... Please wait.");
    } else if (connection === 'open') {
      await delay(3000);
      console.clear();
      if (openedSocket == false) {
        openedSocket = true;
        try {
          const chats = await sock.groupFetchAllParticipating();
          chat_count = Object.keys(chats).length
        } catch {}
      }
      countdown = 50;
      fs.writeFileSync('.started', '1');
    } else if (connection === 'close') {
      console.log("connection close")
      await genQR(qr);
    }
  });
  sock.ev.on('creds.update', saveCreds);
}

async function loginWithPhone(phoneNumber) {
  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = await import('@whiskeysockets/baileys');
  let { version } = await fetchLatestBaileysVersion();
  let state, saveCreds;

  if (process.env.MONGODB_URI) {
    if (!mongoClient) {
        mongoClient = new MongoClient(process.env.MONGODB_URI);
        await mongoClient.connect();
        db = mongoClient.db('zoro_bot');
        authCollection = db.collection('auth_state');
    }
    const { useMongoDBAuthState } = require('./mongoAuth');
    const auth = await useMongoDBAuthState(authCollection);
    state = auth.state;
    saveCreds = auth.saveCreds;
  } else {
    const auth = await useMultiFileAuthState('./session/');
    state = auth.state;
    saveCreds = auth.saveCreds;
  }
  let sock = makeWASocket({
    logger,
    auth: state,
    version: version,
    getMessage: async (key) => {},
  });

  try {
    sock.ev.on('connection.update', async (update) => {
      let { connection } = update;
      if (connection === 'open') {
        console.log('Successfully logged in!');
        await delay(3000);
        openedSocket = true;
        try {
          const chats = await sock.groupFetchAllParticipating();
          chat_count = Object.keys(chats).length
        } catch {}
        countdown = 50;
        fs.writeFileSync('.started', '1');
      } else if (connection === 'close') {
        await loginWithPhone(phoneNumber);
      } else if (!connection && !sock.authState.creds.registered) {
        var pairingCode = await sock.requestPairingCode(phoneNumber);
        pairingCode = pairingCode.slice(0, 4) + "-" + pairingCode.slice(4);

        console.log(`Your WhatsApp pairing code: ${pairingCode}`);
        console.log('Enter this code on your WhatsApp app under "Linked Devices".');
      }
    });

    sock.ev.on('creds.update', saveCreds);
  } catch (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }
}

setInterval(async () => {
  if (openedSocket == false || chat_count <= 0) {
    return;
  }
  if (!fs.existsSync('.started')) {
    return;
  }
  console.clear();
  console.log(`Bot is syncing messages... (${(countdown / 10).toFixed(2)}s left. Chats :: ${chat_count})`);
  countdown--;
  
  if (countdown < 0) {
    console.clear();
    console.log("Run `pm2 start main.js` to start the bot.");
    process.exit(1);
  }

}, 100);
