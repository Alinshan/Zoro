const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const { MongoClient } = require('mongodb');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 8000;
const SESSION_PATH = './session';

let mongoClient, db, authCollection;

let sockInstance = null;
let currentQR = null;
let currentStatus = 'disconnected'; // 'disconnected', 'connecting', 'pairing_ready', 'syncing', 'connected'
let pairingCode = null;
let chatCount = 0;
let syncCountdown = 0;
let connectionInfo = null;
let isHandoff = false;

// Pino logger setup to be completely silent
const logger = pino({ level: 'silent' });

// Serve HTML dashboard
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zoro - WhatsApp Bot Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Playfair+Display:ital,wght@1,600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #0f0c1b 0%, #15102a 50%, #06020f 100%);
            --primary: #9d4edd;
            --primary-glow: rgba(157, 78, 221, 0.4);
            --accent: #240046;
            --success: #38b000;
            --success-glow: rgba(56, 176, 0, 0.4);
            --text-light: #e0aaff;
            --glass-bg: rgba(20, 15, 40, 0.55);
            --glass-border: rgba(157, 78, 221, 0.18);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background: var(--bg-gradient);
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow-x: hidden;
            position: relative;
        }

        /* Abstract glowing background circles */
        .glowing-blob {
            position: absolute;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, var(--primary) 0%, rgba(0,0,0,0) 70%);
            opacity: 0.15;
            filter: blur(80px);
            z-index: 0;
            pointer-events: none;
            animation: float 20s infinite ease-in-out alternate;
        }

        .blob-1 { top: -100px; left: -100px; }
        .blob-2 { bottom: -100px; right: -100px; background: radial-gradient(circle, #3a0ca3 0%, rgba(0,0,0,0) 70%); }

        @keyframes float {
            0% { transform: translate(0, 0) scale(1); }
            100% { transform: translate(50px, 50px) scale(1.2); }
        }

        .container {
            width: 90%;
            max-width: 580px;
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border-radius: 32px;
            padding: 45px 35px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
            z-index: 10;
            position: relative;
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Rebranding Title */
        .header {
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 3rem;
            font-weight: 800;
            letter-spacing: -1px;
            background: linear-gradient(to right, #ffffff 30%, var(--text-light) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
        }

        .header h1 span.logo-highlight {
            font-family: 'Playfair Display', serif;
            font-style: italic;
            color: var(--primary);
            -webkit-text-fill-color: initial;
            text-shadow: 0 0 20px var(--primary-glow);
        }

        .header p {
            color: var(--text-light);
            opacity: 0.8;
            font-size: 1.05rem;
            font-weight: 300;
        }

        /* Status Badge */
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 16px;
            border-radius: 50px;
            font-size: 0.85rem;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            margin-bottom: 25px;
            transition: all 0.3s ease;
        }

        .status-disconnected {
            background: rgba(239, 71, 111, 0.15);
            color: #ef476f;
            border: 1px solid rgba(239, 71, 111, 0.3);
        }

        .status-connecting {
            background: rgba(255, 209, 102, 0.15);
            color: #ffd166;
            border: 1px solid rgba(255, 209, 102, 0.3);
            animation: pulse 1.5s infinite;
        }

        .status-syncing {
            background: rgba(72, 202, 228, 0.15);
            color: #48cae4;
            border: 1px solid rgba(72, 202, 228, 0.3);
        }

        .status-connected {
            background: rgba(56, 176, 0, 0.15);
            color: var(--success);
            border: 1px solid rgba(56, 176, 0, 0.3);
            box-shadow: 0 0 15px rgba(56, 176, 0, 0.25);
        }

        @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
        }

        /* Screen States */
        .screen-state {
            display: none;
            animation: fadeIn 0.5s ease-out forwards;
        }

        .screen-state.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Interactive QR Box */
        .qr-wrapper {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            padding: 25px;
            display: inline-block;
            margin-bottom: 25px;
            position: relative;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .qr-wrapper::before {
            content: '';
            position: absolute;
            top: -2px; left: -2px; right: -2px; bottom: -2px;
            background: linear-gradient(135deg, var(--primary), #3a0ca3);
            border-radius: 26px;
            z-index: -1;
            opacity: 0.4;
            filter: blur(10px);
        }

        .qr-code-img {
            display: block;
            width: 250px;
            height: 250px;
            border-radius: 12px;
            background: #ffffff;
            padding: 10px;
        }

        /* Spinner & Progress Bar */
        .loader {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(157, 78, 221, 0.2);
            border-top: 4px solid var(--primary);
            border-radius: 50%;
            display: inline-block;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .progress-container {
            width: 100%;
            height: 10px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            overflow: hidden;
            margin: 20px 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .progress-bar {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, var(--primary), #7209b7);
            border-radius: 10px;
            transition: width 0.3s ease;
            box-shadow: 0 0 10px var(--primary-glow);
        }

        /* Form Controls */
        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }

        .form-label {
            display: block;
            font-size: 0.9rem;
            color: var(--text-light);
            margin-bottom: 8px;
            font-weight: 500;
        }

        .form-input {
            width: 100%;
            padding: 14px 18px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            color: #ffffff;
            font-size: 1.05rem;
            transition: all 0.3s ease;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 15px var(--primary-glow);
            background: rgba(255, 255, 255, 0.07);
        }

        /* Buttons styling */
        .btn {
            background: linear-gradient(135deg, var(--primary) 0%, #7209b7 100%);
            color: #ffffff;
            border: none;
            padding: 14px 28px;
            font-size: 1rem;
            font-weight: 600;
            border-radius: 14px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 8px 20px -6px var(--primary-glow);
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 25px -4px var(--primary-glow);
            opacity: 0.95;
        }

        .btn-outline {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #ffffff;
            box-shadow: none;
            margin-top: 15px;
        }

        .btn-outline:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.4);
            transform: translateY(-2px);
            box-shadow: none;
        }

        /* Pairing Code Screen */
        .pairing-code-display {
            font-size: 2.5rem;
            font-weight: 800;
            letter-spacing: 5px;
            color: var(--text-light);
            background: rgba(255, 255, 255, 0.03);
            border: 1px dashed var(--glass-border);
            padding: 15px 30px;
            border-radius: 16px;
            display: inline-block;
            margin: 20px 0;
            text-shadow: 0 0 15px var(--primary-glow);
        }

        /* Dashboard View styles */
        .success-checkmark {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: rgba(56, 176, 0, 0.15);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 2px solid var(--success);
            box-shadow: 0 0 20px var(--success-glow);
            color: var(--success);
            font-size: 2.5rem;
            animation: bounceIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes bounceIn {
            0% { transform: scale(0.3); opacity: 0; }
            50% { transform: scale(1.05); opacity: 0.8; }
            70% { transform: scale(0.9); opacity: 0.9; }
            100% { transform: scale(1); opacity: 1; }
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 25px 0;
            text-align: left;
        }

        .info-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 16px;
            padding: 15px;
            transition: all 0.3s ease;
        }

        .info-card:hover {
            background: rgba(255, 255, 255, 0.05);
            border-color: var(--glass-border);
        }

        .info-card-label {
            font-size: 0.8rem;
            color: var(--text-light);
            opacity: 0.7;
            margin-bottom: 5px;
        }

        .info-card-value {
            font-size: 1.1rem;
            font-weight: 600;
        }

        /* Footer credits */
        .footer-text {
            margin-top: 30px;
            font-size: 0.8rem;
            opacity: 0.6;
            color: var(--text-light);
        }

        .footer-text a {
            color: var(--primary);
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="glowing-blob blob-1"></div>
    <div class="glowing-blob blob-2"></div>

    <div class="container">
        <div class="header">
            <h1>Zoro <span class="logo-highlight">WhatsApp Bot</span></h1>
            <p>Supercharge your WhatsApp Automation and Utilities</p>
        </div>

        <div id="statusBadge" class="status-badge status-disconnected">
            Disconnected
        </div>

        <!-- 1. LOADING SCREEN -->
        <div id="screenLoading" class="screen-state active">
            <div class="loader"></div>
            <h3>Connecting to the server...</h3>
            <p style="opacity: 0.6; margin-top: 10px;">Checking active sessions and loading configs.</p>
        </div>

        <!-- 2. QR CODE DISPLAY SCREEN -->
        <div id="screenQR" class="screen-state">
            <h3 style="margin-bottom: 15px;">Link Your Account</h3>
            <p style="opacity: 0.8; margin-bottom: 25px;">Scan the QR code below using your WhatsApp app (Linked Devices menu).</p>
            
            <div class="qr-wrapper">
                <img id="qrImage" class="qr-code-img" src="" alt="WhatsApp QR Code">
            </div>

            <div>
                <button class="btn btn-outline" onclick="showScreen('screenPhoneInput')">Use Phone Pairing Code instead</button>
            </div>
        </div>

        <!-- 3. PHONE INPUT SCREEN -->
        <div id="screenPhoneInput" class="screen-state">
            <h3 style="margin-bottom: 15px;">Pair with Phone Number</h3>
            <p style="opacity: 0.8; margin-bottom: 25px;">Get a 1-click 8-digit code directly on your WhatsApp application.</p>
            
            <div class="form-group">
                <label class="form-label" for="phoneNumber">WhatsApp Number (with Country Code)</label>
                <input type="text" id="phoneNumber" class="form-input" placeholder="e.g. 918592068706">
            </div>

            <button class="btn" onclick="requestPhoneCode()">Get Pairing Code</button>
            <div>
                <button class="btn btn-outline" onclick="showScreen('screenQR')">Back to QR Code Scan</button>
            </div>
        </div>

        <!-- 4. PAIRING CODE DISPLAY SCREEN -->
        <div id="screenPairingCode" class="screen-state">
            <h3 style="margin-bottom: 15px;">Your Pairing Code</h3>
            <p style="opacity: 0.8; margin-bottom: 15px;">Open WhatsApp on your phone, navigate to Linked Devices -> Link with Phone Number, and enter this code:</p>
            
            <div id="pairingCodeDisplay" class="pairing-code-display">---- - ----</div>
            
            <p style="opacity: 0.6; font-size: 0.9rem;">Waiting for validation from your phone...</p>
            
            <div>
                <button class="btn btn-outline" onclick="showScreen('screenPhoneInput')">Change Number</button>
            </div>
        </div>

        <!-- 5. SYNCING CHATS SCREEN -->
        <div id="screenSyncing" class="screen-state">
            <div class="loader" style="border-top-color: #48cae4;"></div>
            <h3>Syncing Your Chats...</h3>
            <p id="syncText" style="opacity: 0.8; margin-top: 10px;">Initializing server session and fetching messages.</p>
            
            <div class="progress-container">
                <div id="progressBar" class="progress-bar"></div>
            </div>
            
            <p style="opacity: 0.6; font-size: 0.85rem;">This will take just a few seconds. Do not close this browser window.</p>
        </div>

        <!-- 6. FULLY CONNECTED SCREEN -->
        <div id="screenConnected" class="screen-state">
            <div class="success-checkmark">✓</div>
            <h2 style="margin-bottom: 10px; color: var(--success);">Zoro Connected Successfully!</h2>
            <p style="opacity: 0.8;">The bot is fully authenticated and active in the background.</p>

            <div class="info-grid">
                <div class="info-card">
                    <div class="info-card-label">Bot Identity</div>
                    <div id="botName" class="info-card-value">Zoro</div>
                </div>
                <div class="info-card">
                    <div class="info-card-label">Linked Number</div>
                    <div id="botNumber" class="info-card-value">Unknown</div>
                </div>
                <div class="info-card">
                    <div class="info-card-label">Owner/Sudo User</div>
                    <div class="info-card-value">Alinshan</div>
                </div>
                <div class="info-card">
                    <div class="info-card-label">Available Plugins</div>
                    <div class="info-card-value">29 Plugins Loaded</div>
                </div>
            </div>

            <p style="font-size: 0.95rem; opacity: 0.85; background: rgba(56, 176, 0, 0.08); padding: 15px; border-radius: 12px; border: 1px solid rgba(56, 176, 0, 0.2);">
                🎉 <strong>All Set!</strong> You can now close this tab. The bot will continue to run seamlessly in the background. Use <strong><code>.menu</code></strong> in any chat to view available options!
            </p>
        </div>

        <p class="footer-text">Developed with ❤️ by <a href="https://github.com/Alinshan/Zoro" target="_blank">Alinshan</a></p>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let activeScreen = 'screenLoading';

        function showScreen(screenId) {
            document.querySelectorAll('.screen-state').forEach(screen => {
                screen.classList.remove('active');
            });
            document.getElementById(screenId).classList.add('active');
            activeScreen = screenId;
        }

        function updateStatusBadge(status) {
            const badge = document.getElementById('statusBadge');
            badge.className = 'status-badge';
            
            if (status === 'disconnected') {
                badge.classList.add('status-disconnected');
                badge.innerText = 'Disconnected';
            } else if (status === 'connecting') {
                badge.classList.add('status-connecting');
                badge.innerText = 'Connecting...';
            } else if (status === 'syncing') {
                badge.classList.add('status-syncing');
                badge.innerText = 'Syncing Messages';
            } else if (status === 'connected') {
                badge.classList.add('status-connected');
                badge.innerText = 'Connected & Active';
            }
        }

        function requestPhoneCode() {
            const number = document.getElementById('phoneNumber').value.trim();
            if (!number) {
                alert('Please enter a valid phone number including country code (e.g. 918592068706).');
                return;
            }
            showScreen('screenLoading');
            socket.emit('request_phone_code', number);
        }

        // Receive real-time updates from Server
        socket.on('state_update', (data) => {
            const { status, qr, pairingCode: code, chatCount, syncCountdown, connectionInfo: info } = data;
            
            updateStatusBadge(status);

            if (status === 'connected') {
                if (info) {
                    document.getElementById('botNumber').innerText = info.number;
                    document.getElementById('botName').innerText = info.name || 'Zoro';
                }
                showScreen('screenConnected');
            } else if (status === 'syncing') {
                showScreen('screenSyncing');
                const progress = Math.max(0, Math.min(100, ((50 - syncCountdown) / 50) * 100));
                document.getElementById('progressBar').style.width = progress + '%';
                document.getElementById('syncText').innerText = \`Synchronizing messages... (\${chatCount} chats indexed, \${(syncCountdown/10).toFixed(1)}s remaining)\`;
            } else if (status === 'connecting') {
                if (qr) {
                    document.getElementById('qrImage').src = qr;
                    if (activeScreen !== 'screenPhoneInput' && activeScreen !== 'screenPairingCode') {
                        showScreen('screenQR');
                    }
                } else if (code) {
                    document.getElementById('pairingCodeDisplay').innerText = code;
                    showScreen('screenPairingCode');
                } else {
                    showScreen('screenLoading');
                }
            } else if (status === 'disconnected') {
                showScreen('screenLoading');
            }
        });
    </script>
</body>
</html>
    `);
});

// Setup dynamic Baileys controller within WebSockets
io.on('connection', (socket) => {
    console.log('[Web UI] User connected to dashboard');
    
    // Send active state immediately
    sendState(socket);

    socket.on('request_phone_code', async (number) => {
        console.log(`[Web UI] Pairing code requested for: ${number}`);
        currentStatus = 'connecting';
        pairingCode = null;
        currentQR = null;
        sendState(io);
        
        await initializeBaileys(true, number);
    });
});

function sendState(target) {
    target.emit('state_update', {
        status: currentStatus,
        qr: currentQR,
        pairingCode,
        chatCount,
        syncCountdown,
        connectionInfo
    });
}

// Clear current session to force a fresh connection if requested
async function initializeBaileys(forcePhone = false, phoneNumber = null) {
    if (sockInstance) {
        try {
            sockInstance.ev.removeAllListeners('connection.update');
            sockInstance.ev.removeAllListeners('creds.update');
            sockInstance = null;
        } catch {}
    }

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
        const auth = await useMultiFileAuthState(SESSION_PATH);
        state = auth.state;
        saveCreds = auth.saveCreds;
    }

    let sock = makeWASocket({
        logger,
        auth: state,
        version: version,
        getMessage: async () => {},
    });

    sockInstance = sock;

    sock.ev.on('connection.update', async (update) => {
        let { connection, qr: qrCode, lastDisconnect } = update;

        if (qrCode && !forcePhone) {
            currentQR = await qrcode.toDataURL(qrCode);
            currentStatus = 'connecting';
            pairingCode = null;
            sendState(io);
        }

        if (connection === 'connecting') {
            console.log('[Baileys] Connecting to WhatsApp...');
            if (currentStatus !== 'connecting') {
                currentStatus = 'connecting';
                sendState(io);
            }
        } else if (connection === 'open') {
            console.log('[Baileys] Connection opened successfully!');
            
            // Collect metadata
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            connectionInfo = {
                number: botJid.split('@')[0],
                name: sock.user.name || 'Zoro'
            };

            // Start Syncing progress view
            currentStatus = 'syncing';
            chatCount = 0;
            try {
                const chats = await sock.groupFetchAllParticipating();
                chatCount = Object.keys(chats).length;
            } catch {}

            syncCountdown = 50;
            sendState(io);

            // Syncing timer
            const syncInterval = setInterval(() => {
                syncCountdown--;
                sendState(io);
                if (syncCountdown <= 0) {
                    clearInterval(syncInterval);
                    currentStatus = 'connected';
                    fs.writeFileSync('.started', '1');
                    sendState(io);
                    console.log('[Baileys] Sync complete. Zoro dashboard active!');
                    
                    // Kill the baileys instance in server.js so main.js can take over!
                    isHandoff = true;
                    setTimeout(() => {
                        try { sockInstance.end(undefined); } catch {}
                        console.log('[Dashboard] Closed local socket. Handoff to bot engine complete.');
                    }, 2000);
                }
            }, 100);

        } else if (connection === 'close') {
            console.log('[Baileys] Connection closed.');
            
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) { // DisconnectReason.loggedOut
                console.log('[Baileys] Device logged out or session invalid. Clearing credentials...');
                if (process.env.MONGODB_URI && authCollection) {
                    await authCollection.deleteMany({});
                } else {
                    try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch {}
                }
            }
            
            if (isHandoff) {
                console.log('[Dashboard] Handoff mode active. Not restarting Baileys.');
                return;
            }
            currentStatus = 'disconnected';
            currentQR = null;
            pairingCode = null;
            sendState(io);
            
            // Auto restart
            await delay(3000);
            await initializeBaileys(forcePhone, phoneNumber);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Request Pairing Code if phone login is triggered
    if (forcePhone && phoneNumber && !sock.authState.creds.registered) {
        try {
            await delay(2000);
            let code = await sock.requestPairingCode(phoneNumber);
            pairingCode = code.slice(0, 4) + "-" + code.slice(4);
            currentStatus = 'connecting';
            currentQR = null;
            sendState(io);
            console.log(`[Baileys] Pairing Code generated: ${pairingCode}`);
        } catch (err) {
            console.error('[Baileys] Failed to generate pairing code:', err);
            currentStatus = 'disconnected';
            sendState(io);
        }
    }
}

// Start HTTP Server
httpServer.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Zoro Web Onboarding Dashboard is running!`);
    console.log(`👉 Open in your web browser: http://localhost:${PORT}`);
    console.log(`======================================================\n`);

    // Check if session already exists
    if (fs.existsSync(path.join(SESSION_PATH, 'creds.json'))) {
        console.log('[Dashboard] Existing session found. Loading...');
        currentStatus = 'connected';
        // Read bot number from creds.json if present
        try {
            const creds = JSON.parse(fs.readFileSync(path.join(SESSION_PATH, 'creds.json'), 'utf8'));
            if (creds.me && creds.me.id) {
                connectionInfo = {
                    number: creds.me.id.split(':')[0],
                    name: creds.me.name || 'Zoro'
                };
            }
        } catch {}
    } else {
        console.log('[Dashboard] No active session found. Ready to scan QR.');
        await initializeBaileys();
    }
});
