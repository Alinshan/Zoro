const fs = require('fs');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

addCommand({ pattern: "^alive$", access: "all", desc: "_Check if the bot is alive with interactive quick-reply buttons._" }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const aliveMessage = global.database.aliveMessage;
    const mediaPath = `./alive.${aliveMessage.type}`;
    const userJid = msg.key.participant || msg.key.remoteJid;
    const userName = userJid.split('@')[0];

    const title = "⚔️ Roronoa Zoro Bot ⚔️";
    const body = aliveMessage.content || "💚 *Roronoa Zoro is Alive and Running!* 💚\n\nTap one of the quick-reply buttons below to browse commands instantly:";
    const footer = "© Zoro Bot Group Tools";

    try {
        if (aliveMessage.type !== "text") {
            if (!fs.existsSync(mediaPath)) {
                fs.writeFileSync(mediaPath, aliveMessage.media, "base64");
            }
            
            // Send the media message first
            await sock.sendMessage(grupId, {
                [aliveMessage.type]: { url: mediaPath },
                caption: aliveMessage.content == "" ? undefined : aliveMessage.content
            }, { quoted: rawMessage.messages[0] });
        }

        // Construct interactive message with native quick reply buttons for categories
        const interactiveMsg = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: body
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: footer
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: title,
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "👥 Group Admin",
                                        id: `${global.handlers[0]}menu group`
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📥 Downloaders",
                                        id: `${global.handlers[0]}menu download`
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📜 All Commands",
                                        id: `${global.handlers[0]}menu all`
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        };

        const msgToPrep = generateWAMessageFromContent(grupId, interactiveMsg, {
            userJid: sock.user.id,
            quoted: rawMessage.messages[0]
        });
        await sock.relayMessage(grupId, msgToPrep.message, { messageId: msgToPrep.key.id });

        if (msg.key.fromMe) {
            try { await sock.sendMessage(grupId, { delete: msg.key }); } catch {}
        }
    } catch (err) {
        console.error("Failed to relay interactive reply buttons: ", err);
        // Visual text dashboard fallback
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

        await sock.sendMessage(grupId, { text: dashboardText, mentions: [userJid] }, { quoted: rawMessage.messages[0] });
    }
});