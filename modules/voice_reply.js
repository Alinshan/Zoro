const fs = require('fs');
const path = require('path');

// Ensure the media directory exists
const mediaDir = path.join(__dirname, '../media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

addCommand({ pattern: "onMessage", dontAddCommandList: true, access: "all" }, async (msg, match, sock, rawMessage) => {
    // Only respond to messages from others (to avoid infinite loops)
    if (msg.key.fromMe) return;

    // Check if the message has text
    if (!msg.text) return;

    const query = msg.text.trim().toLowerCase();
    
    // Skip command strings starting with prefix handlers (. or !)
    if (query.startsWith('.') || query.startsWith('/') || query.startsWith('!')) return;

    try {
        // Read files in the media folder
        const files = fs.readdirSync(mediaDir);
        const audioExtensions = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'];
        
        // Find a file that matches the message text exactly (without extension)
        const matchingFile = files.find(file => {
            const ext = path.extname(file).toLowerCase();
            if (!audioExtensions.includes(ext)) return false;
            
            const baseName = path.basename(file, ext).toLowerCase();
            return baseName === query;
        });

        if (matchingFile) {
            const filePath = path.join(mediaDir, matchingFile);
            
            // Reply with the matched audio file converted as a Voice Note (ptt: true)
            await sock.sendMessage(msg.key.remoteJid, {
                audio: { url: filePath },
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: rawMessage.messages[0] });
        }
    } catch (err) {
        console.error('[voice_reply] Error:', err.message);
    }
});
