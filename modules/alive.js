const fs = require('fs');

addCommand({ pattern: "^alive$", access: "all", desc: "_Check if the bot is alive with a gorgeous visual command console._" }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const aliveMessage = global.database.aliveMessage;
    const mediaPath = `./alive.${aliveMessage.type}`;
    const userJid = msg.key.participant || msg.key.remoteJid;
    const userName = userJid.split('@')[0];

    const body = aliveMessage.content || "💚 *Roronoa Zoro is Alive and Running!* 💚";

    const consoleText = `⚔️ *RORONOA ZORO CONSOLE* ⚔️\n\n` +
                        `💚 *Hello @${userName}!*\n` +
                        `${body}\n\n` +
                        `┌──────────────────────────┐\n` +
                        `│  🟢  *[ 1 ]*  │  👥  *Group Admin*  │\n` +
                        `├──────────────────────────┤\n` +
                        `│  🟢  *[ 2 ]*  │  📥  *Downloaders*  │\n` +
                        `├──────────────────────────┤\n` +
                        `│  🟢  *[ 3 ]*  │  ⚙️  *Owner / Sudo*  │\n` +
                        `├──────────────────────────┤\n` +
                        `│  🟢  *[ 4 ]*  │  📜  *All Commands*  │\n` +
                        `└──────────────────────────┘\n\n` +
                        `👉 *To browse commands:* Swipe-reply to this message with a number (*1* to *4*) to open that category instantly!\n\n` +
                        `_Sole Contributor: *Alinshan*_`;

    try {
        if (aliveMessage.type !== "text") {
            if (!fs.existsSync(mediaPath)) {
                fs.writeFileSync(mediaPath, aliveMessage.media, "base64");
            }
            
            // Send media with the console text as the caption
            await sock.sendMessage(grupId, {
                [aliveMessage.type]: { url: mediaPath },
                caption: consoleText,
                mentions: [userJid]
            }, { quoted: rawMessage.messages[0] });
        } else {
            // Text only message
            await sock.sendMessage(grupId, {
                text: consoleText,
                mentions: [userJid]
            }, { quoted: rawMessage.messages[0] });
        }

        if (msg.key.fromMe) {
            try { await sock.sendMessage(grupId, { delete: msg.key }); } catch {}
        }
    } catch (err) {
        console.error("Failed to send alive message: ", err);
        // Direct text fallback
        await sock.sendMessage(grupId, { text: consoleText, mentions: [userJid] }, { quoted: rawMessage.messages[0] });
    }
});