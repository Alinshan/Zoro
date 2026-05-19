const fs = require('fs');

addCommand({ pattern: "^alive$", access: "all", desc: "_Check if the bot is alive and view command dashboard._" }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const aliveMessage = global.database.aliveMessage;
    const mediaPath = `./alive.${aliveMessage.type}`;
    const userJid = msg.key.participant || msg.key.remoteJid;
    const userName = userJid.split('@')[0];

    const body = aliveMessage.content || "💚 *Roronoa Zoro is Alive and Running!* 💚";

    const dashboardText = `⚔️ *RORONOA ZORO DASHBOARD* ⚔️\n\n` +
                          `💚 *Hello @${userName}!*\n` +
                          `${body}\n\n` +
                          `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n` +
                          `  🟢 *[ 1 ]*  👥  *Group Admin*\n` +
                          `  🟢 *[ 2 ]*  📥  *Downloaders*\n` +
                          `  🟢 *[ 3 ]*  ⚙️  *Owner / Sudo*\n` +
                          `  🟢 *[ 4 ]*  📜  *All Commands*\n` +
                          `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n\n` +
                          `💡 *Tip:* Swipe-reply to this message with a number (*1* to *4*) or type *${global.handlers[0]}menu [number]* to open a category!\n\n` +
                          `_Sole Contributor: *Alinshan*_`;

    try {
        if (aliveMessage.type !== "text") {
            if (!fs.existsSync(mediaPath)) {
                fs.writeFileSync(mediaPath, aliveMessage.media, "base64");
            }
            
            // Send media with the dashboard text as the caption
            await sock.sendMessage(grupId, {
                [aliveMessage.type]: { url: mediaPath },
                caption: dashboardText,
                mentions: [userJid]
            }, { quoted: rawMessage.messages[0] });
        } else {
            // Text only message
            await sock.sendMessage(grupId, {
                text: dashboardText,
                mentions: [userJid]
            }, { quoted: rawMessage.messages[0] });
        }

        if (msg.key.fromMe) {
            try { await sock.sendMessage(grupId, { delete: msg.key }); } catch {}
        }
    } catch (err) {
        console.error("Failed to send alive message: ", err);
        // Direct text fallback
        await sock.sendMessage(grupId, { text: dashboardText, mentions: [userJid] }, { quoted: rawMessage.messages[0] });
    }
});