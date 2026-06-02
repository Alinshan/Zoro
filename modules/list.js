const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// Shared: build a category command list text
// ─────────────────────────────────────────────────────────────────────────────
function buildCategoryText(category, commands, msg, sock, isSudo) {
    let filtered = [];
    if (category === "all") {
        filtered = commands;
    } else if (category === "group") {
        filtered = commands.filter(x =>
            x.commandInfo.onlyInGroups ||
            ["tagall", "tagadmin", "ban", "add", "promote", "demote", "mute", "unmute", "gmute", "ungmute"].some(p =>
                x.commandInfo.pattern.includes(p)
            )
        );
    } else if (category === "download") {
        filtered = commands.filter(x =>
            ["video", "music", "tiktok", "insta", "wp", "ss", "dream"].some(p =>
                x.commandInfo.pattern.includes(p)
            )
        );
    } else if (category === "owner") {
        filtered = commands.filter(x => x.commandInfo.access === "sudo");
    }

    const listText = filtered
        .filter(x => !x.commandInfo.dontAddCommandList &&
            (x.commandInfo.access !== "sudo" || isSudo) &&
            (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
            !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
        .map((x, index, array) => {
            const { pattern, desc, usage, warn } = x.commandInfo;
            const cmd = `${global.handlers[0]}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}`;
            return `⌨️ \`\`\`${cmd}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}${index !== array.length - 1 ? '\n\n' : ''}`;
        })
        .join('');

    const categoryNames = {
        all: "⚔️ All Commands",
        group: "👥 Group Admin Commands",
        download: "📥 Downloader Commands",
        owner: "⚙️ Owner/Sudo Commands"
    };

    return `📜 *${categoryNames[category]}*\n\n${listText.trimEnd()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: build an interactive WhatsApp list message for a category
// ─────────────────────────────────────────────────────────────────────────────
function buildCategoryListMessage(category, commands, msg, sock, isSudo) {
    let filtered = [];
    if (category === "all") {
        filtered = commands;
    } else if (category === "group") {
        filtered = commands.filter(x =>
            x.commandInfo.onlyInGroups ||
            ["tagall", "tagadmin", "ban", "add", "promote", "demote", "mute", "unmute", "gmute", "ungmute"].some(p =>
                x.commandInfo.pattern.includes(p)
            )
        );
    } else if (category === "download") {
        filtered = commands.filter(x =>
            ["video", "music", "tiktok", "insta", "wp", "ss", "dream"].some(p =>
                x.commandInfo.pattern.includes(p)
            )
        );
    } else if (category === "owner") {
        filtered = commands.filter(x => x.commandInfo.access === "sudo");
    }

    const prefix = global.handlers[0];

    const rows = filtered
        .filter(x => !x.commandInfo.dontAddCommandList &&
            (x.commandInfo.access !== "sudo" || isSudo) &&
            (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
            !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
        .map(x => {
            const { pattern, desc } = x.commandInfo;
            const cmd = `${prefix}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}`;
            return {
                title: cmd,
                description: desc ? desc.replace(/_/g, '') : "Tap to use this command",
                rowId: cmd
            };
        })
        .slice(0, 24); // WhatsApp list max is 24 rows total across all sections

    const categoryNames = {
        all: "⚔️ All Commands",
        group: "👥 Group Admin Commands",
        download: "📥 Downloader Commands",
        owner: "⚙️ Owner/Sudo Commands"
    };

    if (rows.length === 0) return null;

    return {
        title: `⚔️ ZORO BOT`,
        text: `📜 *${categoryNames[category]}*\n\nTap a command to use it instantly!`,
        footer: `_Developer: Alinshan_`,
        buttonText: "📋 View Commands",
        sections: [
            {
                title: categoryNames[category],
                rows
            }
        ]
    };
}

global.buildCategoryText = buildCategoryText;
global.buildCategoryListMessage = buildCategoryListMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: send raw proto message (needed for buttons/lists in this Baileys version)
// ─────────────────────────────────────────────────────────────────────────────
async function sendRawProto(sock, jid, protoContent, quoted) {
    const baileys = await import('@whiskeysockets/baileys');
    const { generateWAMessageFromContent, proto } = baileys;
    const msg = generateWAMessageFromContent(jid, proto.Message.fromObject(protoContent), {
        userJid: sock.user.id,
        quoted: quoted || undefined
    });
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU command
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "^men(u|ü) ?(.*)", access: "all", dontAddCommandList: true }, async (msg, match, sock, rawMessage) => {
    let inputCommand = match[2].trim().toLowerCase();

    // Map digit shortcuts
    if (inputCommand === "1") inputCommand = "group";
    else if (inputCommand === "2") inputCommand = "download";
    else if (inputCommand === "3") inputCommand = "owner";
    else if (inputCommand === "4") inputCommand = "all";

    const userId = msg.key.participant || msg.key.remoteJid;
    const isSudo = msg.key.fromMe || global.isSudo(userId);
    const grupId = msg.key.remoteJid;
    const prefix = global.handlers[0];

    async function sendText(text) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(grupId, { text, edit: msg.key });
        } else {
            return await sock.sendMessage(grupId, { text }, { quoted: rawMessage.messages[0] });
        }
    }

    async function sendListMessage(listData) {
        return await sendRawProto(sock, grupId, {
            listMessage: {
                title: listData.title,
                description: listData.text,
                footerText: listData.footer,
                buttonText: listData.buttonText,
                listType: 1,
                sections: listData.sections
            }
        }, rawMessage.messages[0]);
    }

    if (!inputCommand) inputCommand = "all";

    if (["all", "group", "download", "owner"].includes(inputCommand)) {
        const categoryNames = {
            all: "⚔️ All Commands",
            group: "👥 Group Admin Commands",
            download: "📥 Downloader Commands",
            owner: "⚙️ Owner/Sudo Commands"
        };

        // Build rows for list message — WhatsApp allows max 24 rows
        let filtered = global.commands;
        if (inputCommand === "group") {
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

        const rows = filtered
            .filter(x =>
                !x.commandInfo.dontAddCommandList &&
                (x.commandInfo.access !== "sudo" || isSudo) &&
                (!x.commandInfo.onlyInGroups || grupId.endsWith('@g.us')) &&
                !(grupId.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat)
            )
            .map(x => {
                const { pattern, desc } = x.commandInfo;
                const cmd = `${prefix}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}`;
                return {
                    title: cmd,
                    description: desc ? desc.replace(/_/g, '').slice(0, 72) : "Tap to run this command",
                    rowId: cmd
                };
            })
            .slice(0, 24);

        if (rows.length === 0) {
            return await sendText(`_No commands found in this category._`);
        }

        try {
            return await sendListMessage({
                title: `⚔️ ZORO BOT`,
                text: `📜 *${categoryNames[inputCommand]}*\n\n_Tap any command below to run it instantly!_`,
                footer: `_Developer: Alinshan_`,
                buttonText: "📋 View Commands",
                sections: [{ title: categoryNames[inputCommand], rows }]
            });
        } catch (err) {
            // Fallback to plain text if list fails
            const menuText = buildCategoryText(inputCommand, global.commands, msg, sock, isSudo);
            return await sendText(menuText);
        }
    }

    // ── Single command lookup ────────────────────────────────────────────────
    var command = global.commands
        .filter(x => !x.commandInfo.dontAddCommandList &&
            (x.commandInfo.access !== "sudo" || isSudo) &&
            (!x.commandInfo.onlyInGroups || grupId.endsWith('@g.us')) &&
            !(grupId.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
        .find(x => x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "").replace(/ /gmi, "") === inputCommand.replace(/ /gmi, ""));

    if (fs.existsSync(`./modules/${inputCommand}.js`)) command = false;
    let menuText = "";

    if (command) {
        const { pattern, desc, usage, warn, access } = command.commandInfo;
        if (access === "sudo" && !isSudo) {
            menuText = `❌ Command not found: ${inputCommand}`;
        } else {
            menuText = `⌨️ \`\`\`${prefix}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}`;
        }
    } else {
        try {
            const fileContent = fs.readFileSync(`./modules/${inputCommand}.js`, "utf8");
            const patternValues = fileContent.match(/pattern:\s*"(.*?)"/g)?.map(m => m.split('"')[1].replace(/\\\\/g, "\\")) || [];
            patternValues.forEach(OGpattern => {
                const cmd = global.commands
                    .filter(x => !x.commandInfo.dontAddCommandList &&
                        (x.commandInfo.access !== "sudo" || isSudo) &&
                        (!x.commandInfo.onlyInGroups || grupId.endsWith('@g.us')) &&
                        !(grupId.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
                    .find(x => x.commandInfo.pattern === OGpattern);
                if (cmd) {
                    const { pattern, desc, usage, warn, access } = cmd.commandInfo;
                    if (access === "sudo" && !isSudo) {
                        menuText = `❌ Command not found: ${inputCommand}`;
                    } else {
                        menuText += `⌨️ \`\`\`${prefix}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}\n\n`;
                    }
                }
            });
        } catch {
            const allCmds = global.commands.filter(x => !x.commandInfo.dontAddCommandList &&
                (x.commandInfo.access !== "sudo" || isSudo) &&
                (!x.commandInfo.onlyInGroups || grupId.endsWith('@g.us')) &&
                !(grupId.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat));

            const modules_means = allCmds.map(x => ({
                pattern: x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", ""),
                similarity_score: global.similarity.default.stringSimilarity(inputCommand,
                    x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "").replace(prefix, ""))
            }));
            modules_means.sort((a, b) => b.similarity_score - a.similarity_score);
            menuText = `_❌ Command not found: ${inputCommand}_\n\n_Did you mean:_ \`\`\`${prefix}${modules_means[0].pattern}\`\`\``;
        }
    }

    return await sendText(menuText.trimEnd());
});

// ─────────────────────────────────────────────────────────────────────────────
// onMessage interceptor: legacy reply with 1-4 to dashboard text
// ─────────────────────────────────────────────────────────────────────────────
addCommand({ pattern: "onMessage", access: "all", dontAddCommandList: true }, async (msg, match, sock, rawMessage) => {
    let text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text;
    if (!text) return;

    text = text.trim();
    if (!/^[1-4]$/.test(text)) return;

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) return;

    const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || quotedMsg.imageMessage?.caption || quotedMsg.videoMessage?.caption || quotedMsg.protocolMessage?.editedMessage?.extendedTextMessage?.text || "";
    if (!quotedText) return;

    if (quotedText.includes("ZORO MENU") || quotedText.includes("RORONOA ZORO MENU") || quotedText.includes("RORONOA ZORO CONSOLE") || quotedText.includes("Zoro Bot Dashboard") || quotedText.includes("ZORO CONSOLE")) {
        const categoryMap = { "1": "group", "2": "download", "3": "owner", "4": "all" };
        const category = categoryMap[text];
        const userId = msg.key.participant || msg.key.remoteJid;
        const isSudo = msg.key.fromMe || global.isSudo(userId);
        const grupId = msg.key.remoteJid;

        const menuText = buildCategoryText(category, global.commands, msg, sock, isSudo);
        await sock.sendMessage(grupId, { text: menuText }, { quoted: rawMessage.messages[0] });
    }
});