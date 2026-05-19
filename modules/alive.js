const fs = require('fs');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

addCommand({ pattern: "^alive$", access: "all", desc: "_Check if the bot is alive with selectable interactive command menu._" }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const aliveMessage = global.database.aliveMessage;
    const mediaPath = `./alive.${aliveMessage.type}`;

    const title = "⚔️ Zoro Command Menu ⚔️";
    const body = aliveMessage.content || "💚 *Roronoa Zoro is Alive and Running!* 💚\n\nChoose a command from the list below to interact with the bot instantly!";
    const footer = "© Alinshan / Zoro Bot";

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

        // Construct interactive message with native single-select button list
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
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "⚔️ Select Command Menu",
                                        sections: [
                                            {
                                                title: "👥 Group Admin",
                                                rows: [
                                                    { title: "Ban Member", description: "Remove a member from group", id: ".ban" },
                                                    { title: "Add Member", description: "Add a member to group", id: ".add" },
                                                    { title: "Promote", description: "Promote member to admin", id: ".promote" },
                                                    { title: "Demote", description: "Remove admin from member", id: ".demote" },
                                                    { title: "Mute Chat", description: "Mute the group chat", id: ".mute" },
                                                    { title: "Unmute Chat", description: "Unmute the group chat", id: ".unmute" }
                                                ]
                                            },
                                            {
                                                title: "📥 Downloaders",
                                                rows: [
                                                    { title: "YouTube Video", description: "Download YT videos", id: ".video" },
                                                    { title: "YouTube Music", description: "Download YT music/audio", id: ".music" },
                                                    { title: "TikTok Downloader", description: "Download TikTok videos", id: ".tiktok" },
                                                    { title: "Instagram Downloader", description: "Download IG posts/reels", id: ".insta" }
                                                ]
                                            },
                                            {
                                                title: "⚙️ Utilities",
                                                rows: [
                                                    { title: "Check Latency", description: "Show bot response speed", id: ".ping" },
                                                    { title: "Sticker Maker", description: "Convert image to sticker", id: ".sticker" },
                                                    { title: "Set Group Icon", description: "Update profile photo", id: ".gpp" },
                                                    { title: "Zoro Dashboard", description: "Show complete menu categories", id: ".menu" }
                                                ]
                                            }
                                        ]
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
        console.error("Failed to relay interactive message: ", err);
        // Text fallback
        const fallbackText = `${body}\n\n*Use \`\`\`.menu\`\`\` to display selectable command dashboard!*`;
        if (msg.key.fromMe) {
            return await sock.sendMessage(grupId, { text: fallbackText, edit: msg.key });
        } else {
            return await sock.sendMessage(grupId, { text: fallbackText }, { quoted: rawMessage.messages[0] });
        }
    }
});