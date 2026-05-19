const fs = require('fs');

addCommand({ pattern: "^alive$", access: "all", desc: "_Check if the bot is alive and open the interactive command menu._" }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const aliveMessage = global.database.aliveMessage;
    const mediaPath = `./alive.${aliveMessage.type}`;
    const userJid = msg.key.participant || msg.key.remoteJid;
    const userName = userJid.split('@')[0];

    const body = aliveMessage.content || "💚 *Roronoa Zoro is Alive and Running!* 💚";

    const consoleText = `⚔️ *RORONOA ZORO CONSOLE* ⚔️\n\n` +
                        `💚 *Hello @${userName}!*\n` +
                        `${body}\n\n` +
                        `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n` +
                        `👇 *Tap a category below to view commands!*\n` +
                        `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n\n` +
                        `_Sole Contributor: *Alinshan*_`;

    try {
        if (aliveMessage.type !== "text") {
            if (!fs.existsSync(mediaPath)) {
                fs.writeFileSync(mediaPath, aliveMessage.media, "base64");
            }
            await sock.sendMessage(grupId, {
                [aliveMessage.type]: { url: mediaPath },
                caption: consoleText,
                mentions: [userJid]
            }, { quoted: rawMessage.messages[0] });
        } else {
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
        await sock.sendMessage(grupId, { text: consoleText, mentions: [userJid] }, { quoted: rawMessage.messages[0] });
    }

    // Send interactive poll for category selection
    try {
        await sock.sendMessage(grupId, {
            poll: {
                name: "⚔️ Zoro Menu — Select a category:",
                values: [
                    "👥 Group Admin",
                    "📥 Downloaders",
                    "⚙️ Owner / Sudo",
                    "📜 All Commands"
                ],
                selectableCount: 1
            }
        });
    } catch (pollErr) {
        console.error("Failed to send poll: ", pollErr);
    }
});