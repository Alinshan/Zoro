const fs = require('fs');

addCommand({ pattern: "^alive$", access: "all", desc: "_Check if the bot is alive and open the interactive command menu._" }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const aliveMessage = global.database.aliveMessage;
    const userJid = msg.key.participant || msg.key.remoteJid;
    const userName = userJid.split('@')[0];
    const prefix = global.handlers[0];

    const body = aliveMessage.content || "💚 *Zoro is Alive and Running!* 💚";
    const bodyText = `💚 *Hello @${userName}!*\n${body}`;

    const buttons = [
        { buttonId: `${prefix}menu group`,    buttonText: { displayText: '👥 Group Admin'   }, type: 1 },
        { buttonId: `${prefix}menu download`, buttonText: { displayText: '📥 Downloaders'   }, type: 1 },
        { buttonId: `${prefix}menu all`,      buttonText: { displayText: '📜 All Commands'  }, type: 1 },
    ];

    try {
        // If there is a custom image/video alive message, send it with caption + buttons
        if (aliveMessage.type === "image") {
            const mediaPath = `./alive.image`;
            if (!fs.existsSync(mediaPath)) {
                fs.writeFileSync(mediaPath, aliveMessage.media, "base64");
            }
            return await sock.sendMessage(grupId, {
                image: { url: mediaPath },
                caption: bodyText,
                footer: '_Developer: Alinshan_',
                buttons,
                headerType: 4, // image header
                mentions: [userJid]
            }, { quoted: rawMessage.messages[0] });
        }

        // Default: plain text button message
        await sock.sendMessage(grupId, {
            text: bodyText,
            footer: '_Developer: Alinshan_',
            buttons,
            headerType: 1,
            mentions: [userJid]
        }, { quoted: rawMessage.messages[0] });

    } catch (err) {
        console.error("[alive] Button message failed, falling back to list:", err.message);
        // Fallback: WhatsApp list message (also works on Business)
        try {
            await sock.sendMessage(grupId, {
                listMessage: {
                    title: "⚔️ ZORO BOT",
                    text: bodyText,
                    footer: "_Developer: Alinshan_",
                    buttonText: "📋 Open Menu",
                    sections: [{
                        title: "🗂️ Command Categories",
                        rows: [
                            { title: "👥 Group Admin",     description: "Manage group members & more", rowId: `${prefix}menu group`    },
                            { title: "📥 Downloaders",     description: "YouTube, TikTok, Instagram",  rowId: `${prefix}menu download` },
                            { title: "⚙️ Owner / Sudo",   description: "Bot management tools",         rowId: `${prefix}menu owner`    },
                            { title: "📜 All Commands",    description: "Full list of bot commands",    rowId: `${prefix}menu all`      },
                        ]
                    }]
                }
            }, { quoted: rawMessage.messages[0] });
        } catch (err2) {
            // Last resort: plain text
            const fallbackText = `⚔️ *ZORO CONSOLE* ⚔️\n\n${bodyText}\n\n1️⃣ 👥 Group Admin\n2️⃣ 📥 Downloaders\n3️⃣ ⚙️ Owner / Sudo\n4️⃣ 📜 All Commands\n\n_Developer: Alinshan_`;
            await sock.sendMessage(grupId, { text: fallbackText, mentions: [userJid] }, { quoted: rawMessage.messages[0] });
        }
    }
});