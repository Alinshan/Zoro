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

global.buildCategoryText = buildCategoryText;

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
    const userName = userId.split('@')[0];

    async function sendReply(text) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(grupId, { text, edit: msg.key });
        } else {
            return await sock.sendMessage(grupId, { text }, { quoted: rawMessage.messages[0] });
        }
    }

    if (!inputCommand) {
        const dashboardText = `⚔️ *ZORO MENU* ⚔️\n\n` +
                              `💚 *Hello @${userName}!*\n` +
                              `Welcome to *Zoro* WhatsApp Bot Group.\n\n` +
                              `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n` +
                              `👇 *Reply with a number below to view commands!*\n` +
                              `*━━━━━━━━━━━━━━━━━━━━━━━━━━*\n\n` +
                              `1️⃣ 👥 Group Admin\n` +
                              `2️⃣ 📥 Downloaders\n` +
                              `3️⃣ ⚙️ Owner / Sudo\n` +
                              `4️⃣ 📜 All Commands\n\n` +
                              `_Developer: *Alinshan*_`;

        return await sendReply(dashboardText);
    }

    if (["all", "group", "download", "owner"].includes(inputCommand)) {
        const menuText = buildCategoryText(inputCommand, global.commands, msg, sock, isSudo);
        return await sendReply(menuText);
    }

    // Single command lookup
    var command = global.commands
        .filter(x => !x.commandInfo.dontAddCommandList &&
            (x.commandInfo.access !== "sudo" || isSudo) &&
            (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
            !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
        .find(x => x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "").replace(/ /gmi, "") === inputCommand.replace(/ /gmi, ""));

    if (fs.existsSync(`./modules/${inputCommand}.js`)) command = false;
    let menuText = "";

    if (command) {
        const { pattern, desc, usage, warn, access } = command.commandInfo;
        if (access === "sudo" && !isSudo) {
            menuText = `❌ Command not found: ${inputCommand}`;
        } else {
            menuText = `⌨️ \`\`\`${global.handlers[0]}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}`;
        }
    } else {
        try {
            const fileContent = fs.readFileSync(`./modules/${inputCommand}.js`, "utf8");
            const patternValues = fileContent.match(/pattern:\s*"(.*?)"/g)?.map(m => m.split('"')[1].replace(/\\\\/g, "\\")) || [];
            patternValues.forEach(OGpattern => {
                const cmd = global.commands
                    .filter(x => !x.commandInfo.dontAddCommandList &&
                        (x.commandInfo.access !== "sudo" || isSudo) &&
                        (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
                        !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat))
                    .find(x => x.commandInfo.pattern === OGpattern);
                if (cmd) {
                    const { pattern, desc, usage, warn, access } = cmd.commandInfo;
                    if (access === "sudo" && !isSudo) {
                        menuText = `❌ Command not found: ${inputCommand}`;
                    } else {
                        menuText += `⌨️ \`\`\`${global.handlers[0]}${pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "")}\`\`\`${desc ? `\nℹ️ ${desc}` : ''}${usage ? `\n💻 \`\`\`${usage}\`\`\`` : ''}${warn ? `\n⚠️ ${warn}` : ''}\n\n`;
                    }
                }
            });
        } catch {
            const allCmds = global.commands.filter(x => !x.commandInfo.dontAddCommandList &&
                (x.commandInfo.access !== "sudo" || isSudo) &&
                (!x.commandInfo.onlyInGroups || msg.key.remoteJid.endsWith('@g.us')) &&
                !(msg.key.remoteJid.split("@")[0] === sock.user.id.split("@")[0] && x.commandInfo.notAvaliablePersonelChat));

            const modules_means = allCmds.map(x => ({
                pattern: x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", ""),
                similarity_score: global.similarity.default.stringSimilarity(inputCommand,
                    x.commandInfo.pattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\\\/]/g, '').replace("sS", "").replace(global.handlers[0], ""))
            }));
            modules_means.sort((a, b) => b.similarity_score - a.similarity_score);
            menuText = `_❌ Command not found: ${inputCommand}_\n\n_Did you mean:_ \`\`\`${global.handlers[0]}${modules_means[0].pattern}\`\`\``;
        }
    }

    return await sendReply(menuText.trimEnd());
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

    const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || quotedMsg.imageMessage?.caption || "";
    if (!quotedText) return;

    if (quotedText.includes("ZORO MENU") || quotedText.includes("RORONOA ZORO MENU") || quotedText.includes("RORONOA ZORO CONSOLE") || quotedText.includes("Zoro Bot Dashboard")) {
        const categoryMap = { "1": "group", "2": "download", "3": "owner", "4": "all" };
        const category = categoryMap[text];
        const userId = msg.key.participant || msg.key.remoteJid;
        const isSudo = msg.key.fromMe || global.isSudo(userId);
        const grupId = msg.key.remoteJid;

        const menuText = buildCategoryText(category, global.commands, msg, sock, isSudo);
        await sock.sendMessage(grupId, { text: menuText }, { quoted: rawMessage.messages[0] });
    }
});