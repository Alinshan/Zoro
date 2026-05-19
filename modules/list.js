const fs = require('fs');

/**
 * Handles the "menu" command, which allows users to view a list of available commands and their descriptions.
 *
 * @param {object} msg - The message object containing the command.
 * @param {string[]} match - An array containing the matched parts of the command pattern.
 * @param {object} sock - The WhatsApp socket connection.
 * @param {object} rawMessage - The raw message object.
 * @returns {Promise<void>} - A promise that resolves when the message has been sent.
 */

addCommand( {pattern: "^men(u|ü) ?(.*)", access: "all", dontAddCommandList: true}, async (msg, match, sock, rawMessage) => {
    let inputCommand = match[2].trim().toLowerCase();
    
    // Map digit shortcuts
    if (inputCommand === "1") inputCommand = "group";
    else if (inputCommand === "2") inputCommand = "download";
    else if (inputCommand === "3") inputCommand = "owner";
    else if (inputCommand === "4") inputCommand = "all";

    const userId = msg.key.participant || msg.key.remoteJid;
    const isSudo = msg.key.fromMe || global.isSudo(userId);
    const grupId = msg.key.remoteJid;
    const userName = userId.split('@')[0];
    
    if (!inputCommand) {
        const dashboardText = `⚔️ *RORONOA ZORO MENU* ⚔️\n\n` +
                              `💚 *Hello @${userName}!*\n` +
                              `Welcome to *Roronoa Zoro* WhatsApp Command Center.\n\n` +
                              `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n` +
                              `  🟢 *[ 1 ]*  👥  *Group Admin*\n` +
                              `  🟢 *[ 2 ]*  📥  *Downloaders*\n` +
                              `  🟢 *[ 3 ]*  ⚙️  *Owner / Sudo*\n` +
                              `  🟢 *[ 4 ]*  📜  *All Commands*\n` +
                              `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n\n` +
                              `💡 *Tip:* Swipe-reply to this message with a number (*1* to *4*) or type *${global.handlers[0]}menu [number]* to open a category!\n\n` +
                              `_Sole Contributor: *Alinshan*_`;

        if (msg.key.fromMe) {
            return await sock.sendMessage(grupId, { text: dashboardText, mentions: [userId], edit: msg.key });
        } else {
            return await sock.sendMessage(grupId, { text: dashboardText, mentions: [userId] }, { quoted: rawMessage.messages[0] });
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

        const menuText = `📜 *${categoryNames[inputCommand]}*\n\n${listText.trimEnd()}`;
        
        if (msg.key.fromMe) {
            return await sock.sendMessage(grupId, { text: menuText, edit: msg.key });
        } else {
            return await sock.sendMessage(grupId, { text: menuText }, { quoted: rawMessage.messages[0] });
        }
    } else {
        // Single command details search
        var command = global.commands
        .filter(x => !x.commandInfo.dontAddCommandList &&
            (x.commandInfo.access !== "sudo" || isSudo) &&
            (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
            !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
        .find(x => x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "").replace(/ /gmi, "") === inputCommand.replace(/ /gmi, ""));

        if (fs.existsSync(`./modules/${inputCommand}.js`)) command = false;
        let menuText = "";
        
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
                    
                var modules_means = [];
                command.forEach((x) => {
                    modules_means.push({
                        pattern: `${x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "")}`,
                        similarity_score: global.similarity.default.stringSimilarity(inputCommand, x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\/]/g, '').replace("sS", "").replace(global.handlers[0], ""))
                    });
                });
                modules_means.sort((a, b) => b.similarity_score - a.similarity_score);
                menuText = `_❌ Command not found: ${inputCommand}_\n\n_Did you mean:_ ` + "```" + global.handlers[0] + modules_means[0].pattern + "```";
            }
        }
        
        if (msg.key.fromMe) {
            return await sock.sendMessage(grupId, { text: menuText.trimEnd(), edit: msg.key });
        } else {
            return await sock.sendMessage(grupId, { text: menuText.trimEnd() }, { quoted: rawMessage.messages[0] });
        }
    }
});

// Interceptor to listen to menu replies
addCommand({ pattern: "onMessage", access: "all", dontAddCommandList: true }, async (msg, match, sock, rawMessage) => {
    let text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
    if (!text) return;
    
    text = text.trim();
    if (!/^[1-4]$/.test(text)) return;
    
    // Check if it's a quoted reply to our dashboard
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) return;
    
    const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!quotedText) return;
    
    if (quotedText.includes("RORONOA ZORO MENU") || quotedText.includes("RORONOA ZORO DASHBOARD") || quotedText.includes("Zoro Bot Dashboard")) {
        const categoryMap = {
            "1": "group",
            "2": "download",
            "3": "owner",
            "4": "all"
        };
        const category = categoryMap[text];
        const userId = msg.key.participant || msg.key.remoteJid;
        const isSudo = msg.key.fromMe || global.isSudo(userId);
        const grupId = msg.key.remoteJid;
        
        let filtered = [];
        if (category === "all") {
            filtered = global.commands;
        } else if (category === "group") {
            filtered = global.commands.filter(x => 
                x.commandInfo.onlyInGroups || 
                ["tagall", "tagadmin", "ban", "add", "promote", "demote", "mute", "unmute", "gmute", "ungmute"].some(p => 
                    x.commandInfo.pattern.includes(p)
                )
            );
        } else if (category === "download") {
            filtered = global.commands.filter(x => 
                ["video", "music", "tiktok", "insta", "wp", "ss", "dream"].some(p => 
                    x.commandInfo.pattern.includes(p)
                )
            );
        } else if (category === "owner") {
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

        const menuText = `📜 *${categoryNames[category]}*\n\n${listText.trimEnd()}`;
        
        await sock.sendMessage(grupId, { text: menuText }, { quoted: rawMessage.messages[0] });
    }
});