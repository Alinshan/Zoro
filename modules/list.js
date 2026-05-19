const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

/**
 * Handles the "menu" command, which allows users to view a list of available commands and their descriptions.
 *
 * The command can be invoked with or without an argument. If no argument is provided, it displays a buttonised dashboard.
 *
 * @param {object} msg - The message object containing the command.
 * @param {string[]} match - An array containing the matched parts of the command pattern.
 * @param {object} sock - The WhatsApp socket connection.
 * @param {object} rawMessage - The raw message object.
 * @returns {Promise<void>} - A promise that resolves when the message has been sent.
 */

addCommand( {pattern: "^men(u|ü) ?(.*)", access: "all", dontAddCommandList: true}, async (msg, match, sock, rawMessage) => {
    const inputCommand = match[2].trim().toLowerCase();
    let menuText = "";

    const userId = msg.key.participant || msg.key.remoteJid;
    const isSudo = msg.key.fromMe || global.isSudo(userId);
    const grupId = msg.key.remoteJid;
    
    if (!inputCommand) {
        const title = "⚔️ Zoro Bot Dashboard ⚔️";
        const bodyText = `*Hello @${(msg.key.participant || msg.key.remoteJid).split('@')[0]}!*\n\nWelcome to *Roronoa Zoro* WhatsApp Command Center.\n\nClick the category buttons below to view specific commands!`;
        const footerText = "© Alinshan / Zoro Bot";
        
        const buttons = [
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "⚔️ All Commands",
                    id: ".menu all"
                })
            },
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "👥 Group Admin",
                    id: ".menu group"
                })
            },
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "📥 Downloader",
                    id: ".menu download"
                })
            },
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "⚙️ Owner/Sudo",
                    id: ".menu owner"
                })
            }
        ];

        try {
            const interactiveMsg = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({
                                text: bodyText
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: footerText
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: title,
                                hasMediaAttachment: false
                            }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: buttons
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
            return;
        } catch (err) {
            console.error("Failed to send interactive message: ", err);
            // Fallback to text dashboard if sending button fails
            menuText = `💚 *Zoro Menu Dashboard* 💚\n\n` +
                       `*Use these commands to navigate:*\n` +
                       `• \`\`\`.menu all\`\`\` - Show all commands\n` +
                       `• \`\`\`.menu group\`\`\` - Show group admin commands\n` +
                       `• \`\`\`.menu download\`\`\` - Show downloader commands\n` +
                       `• \`\`\`.menu owner\`\`\` - Show owner/sudo commands`;
            
            if (msg.key.fromMe) {
                return await sock.sendMessage(grupId, { text: menuText, edit: msg.key });
            } else {
                return await sock.sendMessage(grupId, { text: menuText }, { quoted: rawMessage.messages[0] });
            }
        }
    }

    if (["all", "group", "download", "owner"].includes(inputCommand)) {
        let filtered = [];
        if (inputCommand === "all") {
            filtered = global.commands;
        } else if (inputCommand === "group") {
            filtered = global.commands.filter(x => 
                x.commandInfo.onlyInGroups || 
                ["tagall", "tagadmin", "ban", "add", "promote", "demote", "mute", "unmute", "gmute", "ungmute"].some(p => 
                    x.commandInfo.pattern.includes(p)
                )
            );
        } else if (inputCommand === "download") {
            filtered = global.commands.filter(x => 
                ["video", "music", "tiktok", "insta", "wp", "ss", "dream"].some(p => 
                    x.commandInfo.pattern.includes(p)
                )
            );
        } else if (inputCommand === "owner") {
            filtered = global.commands.filter(x => x.commandInfo.access === "sudo");
        }

        const listText = filtered
            .filter(x => !x.commandInfo.dontAddCommandList &&
                (x.commandInfo.access !== "sudo" || isSudo) &&
                (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
                !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
            .map((x, index, array) => {
                const { pattern, desc, usage, warn } = x.commandInfo;
                return `⌨️ \`\`\`${global.handlers[0]}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}${index !== array.length - 1 ? '\n\n' : ''}`;
            })
            .join('');

        const categoryNames = {
            all: "⚔️ All Commands",
            group: "👥 Group Admin Commands",
            download: "📥 Downloader Commands",
            owner: "⚙️ Owner/Sudo Commands"
        };

        menuText = `📜 *${categoryNames[inputCommand]}*\n\n${listText.trimEnd()}`;
    } else {
        // Single command details search
        var command = global.commands
        .filter(x => !x.commandInfo.dontAddCommandList &&
            (x.commandInfo.access !== "sudo" || isSudo) &&
            (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
            !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
        .find(x => x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "").replace(/ /gmi, "") === inputCommand.replace(/ /gmi, ""));

        if (fs.existsSync(`./modules/${inputCommand}.js`)) command = false
        if (command) {
            const { pattern, desc, usage, warn, access } = command.commandInfo;
            if (access === "sudo" && !isSudo) {
                menuText = `❌ Command not found: ${inputCommand}`;
            } else {
                menuText = `⌨️ \`\`\`${global.handlers[0]}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}`;
            }
        } else {
            try {
                const fileContent = fs.readFileSync(`./modules/${inputCommand}.js`, "utf8");
                const patternValues = fileContent.match(/pattern:\s*"(.*?)"/g)?.map(match => match.split('"')[1].replace(/\\\\/g, "\\")) || [];
                
                patternValues.forEach(OGpattern => {
                    const command = global.commands
                    .filter(x => !x.commandInfo.dontAddCommandList &&
                        (x.commandInfo.access !== "sudo" || isSudo) &&
                        (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
                        !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
                    .find(x => x.commandInfo.pattern === OGpattern);

                    if (command) {
                        const { pattern, desc, usage, warn, access } = command.commandInfo;
                        if (access === "sudo" && !isSudo) {
                            menuText = `❌ Command not found: ${inputCommand}`;
                        } else {
                            menuText += `⌨️ \`\`\`${global.handlers[0]}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}\n\n`;
                        }
                    }
                });
            } catch {
                command = global.commands
                .filter(x => !x.commandInfo.dontAddCommandList &&
                    (x.commandInfo.access !== "sudo" || isSudo) &&
                    (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
                    !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
                    
                var modules_means = []
                await command.forEach(async (x) => {
                    modules_means.push({
                        pattern: `${x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "")}`,
                        similarity_score: await global.similarity.default.stringSimilarity(inputCommand, x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "").replace(global.handlers[0], ""))
                    })
                })
                modules_means.sort((a, b) => b.similarity_score - a.similarity_score);
                menuText = `_❌ Command not found: ${inputCommand}_\n\n_Did you mean:_ ` + "```" + global.handlers[0] + modules_means[0].pattern + "```";
            }
        }
    }

    if (msg.key.fromMe) {
        return await sock.sendMessage(grupId, { text: menuText.trimEnd(), edit: msg.key });
    } else {
        return await sock.sendMessage(grupId, { text: menuText.trimEnd() }, { quoted: rawMessage.messages[0] });
    }
});