const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

console.log('======================================================');
console.log('🚀 Starting Zoro Unified Cloud Launcher...');
console.log('======================================================\n');

const SESSION_DIR = path.join(__dirname, 'session');
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');
const STARTED_PATH = path.join(__dirname, '.started');

// Start the Express web dashboard (server.js) in a background process
// This serves the QR / Phone pairing panel on the cloud public URL
console.log('[Launcher] Starting onboarding web server...');
const webProcess = fork(path.join(__dirname, 'server.js'));

let botProcess = null;

function startBot() {
    if (botProcess) return;
    console.log('\n🤖 [Launcher] Session credentials verified! Spawning Zoro Bot Engine...');
    botProcess = fork(path.join(__dirname, 'main.js'));
    
    botProcess.on('exit', (code) => {
        console.log(`🤖 [Launcher] Bot engine exited with code ${code}. Rebooting in 5s...`);
        botProcess = null;
        setTimeout(startBot, 5000);
    });
}

async function checkMongoCreds() {
    if (process.env.MONGODB_URI) {
        try {
            const mongoClient = new MongoClient(process.env.MONGODB_URI);
            await mongoClient.connect();
            const db = mongoClient.db('zoro_bot');
            const authCollection = db.collection('auth_state');
            const creds = await authCollection.findOne({ _id: 'creds' });
            await mongoClient.close();
            return !!creds;
        } catch (e) {
            return false;
        }
    }
    return false;
}

async function init() {
    let credsExist = false;
    
    // Check local creds
    if (fs.existsSync(CREDS_PATH)) {
        try {
            JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
            credsExist = true;
        } catch (e) {}
    }
    
    // Check MongoDB creds if we didn't find local ones
    if (!credsExist && process.env.MONGODB_URI) {
        credsExist = await checkMongoCreds();
    }
    
    if (credsExist || fs.existsSync(STARTED_PATH)) {
        startBot();
        return;
    }
    
    console.log('[Launcher] Waiting for web login or sync...');
    
    // Active polling to boot the bot the instant the user logs in
    const checkInterval = setInterval(() => {
        if (fs.existsSync(STARTED_PATH)) {
            clearInterval(checkInterval);
            startBot();
            return;
        }
        
        if (fs.existsSync(CREDS_PATH)) {
            try {
                JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
                clearInterval(checkInterval);
                startBot();
            } catch (e) {}
        }
    }, 2000);
}

init();

// Capture signals to kill child processes cleanly on termination
process.on('SIGINT', () => {
    console.log('\n[Launcher] Shutting down cleanly...');
    if (webProcess) webProcess.kill();
    if (botProcess) botProcess.kill();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Launcher] Shutting down cleanly...');
    if (webProcess) webProcess.kill();
    if (botProcess) botProcess.kill();
    process.exit(0);
});
