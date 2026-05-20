addCommand({ pattern: "^repo$", access: "all", desc: "Get the bot's GitHub repository link." }, async (msg, match, sock, rawMessage) => {
    const grupId = msg.key.remoteJid;
    const repoText = `⚔️ *Zoro GitHub Repository* ⚔️\n\n` +
                     `🌟 *Star the repo to show support!*\n` +
                     `🔗 https://github.com/Alinshan/Zoro\n\n` +
                     `_Developer: *Alinshan*_`;

    if (msg.key.fromMe) {
        return await sock.sendMessage(grupId, { text: repoText, edit: msg.key });
    } else {
        return await sock.sendMessage(grupId, { text: repoText }, { quoted: rawMessage.messages[0] });
    }
});
