addCommand({ pattern: "^worktype ?(.*)", access: "sudo", desc: "_Change the working type of the bot._", usage: global.handlers[0] + "worktype <public || private>" }, async (msg, match, sock, rawMessage) => {
    const reply = async (text) => {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text, edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: rawMessage.messages[0] });
        }
    };

    var worktype = match[1]?.trim().toLowerCase();
    if (!worktype) {
        return await reply("_Please specify the working type of the bot._\n\n_Bot is currently set to_ *" + global.database.worktype + "*._");
    }

    if (worktype === "public" || worktype === "private") {
        global.database.worktype = worktype;
        return await reply("_The working type of the bot has been changed to_ *" + worktype + "*._");
    } else {
        return await reply("_Invalid working type. Please use 'public' or 'private'._");
    }
})