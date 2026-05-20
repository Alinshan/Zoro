const axios = require('axios');
const fs = require('fs');

/**
 * Take a screenshot of a website.
 * @param {string} url - The URL of the website to take a screenshot of.
 * @returns {Promise<ArrayBuffer>} - A Promise that resolves to the screenshot as an ArrayBuffer.
 */
async function takeScreenshot(url) {
    const response = await axios.get("https://api.pikwy.com/?tkn=125&d=3000&u=" + encodeURIComponent(url) + "&fs=1&w=1280&h=1200&s=100&z=100&f=jpg&rt=jweb");
    const imgRes = await axios.get(response.data.iurl, { responseType: 'arraybuffer' });
    return imgRes.data;
}

addCommand({ pattern: '^ss ?(.*)', access: 'all', desc: 'Take a screenshot of a website.', pluginVersion: "1.0.2", pluginId: "screenshot"}, async (msg, match, sock, rawMessage) => {
    const url = match[1];
    if (!url) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a URL to take a screenshot of._', edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Please provide a URL to take a screenshot of._'}, { quoted: rawMessage.messages[0] });
        }
    }


    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: '_⏳ Taking screenshot.._', edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: '_⏳ Taking screenshot.._'}, { quoted: rawMessage.messages[0] });
    }

    try {
        const screenshot = await takeScreenshot(url);
        var mediaPath = './src/ss' + Math.floor(Math.random() * 20) + '.png';
        fs.writeFileSync(mediaPath, screenshot);
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaPath }, caption: '_📸 Screenshot taken!_' });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { image: { url: mediaPath }, caption: '_📸 Screenshot taken!_' });
        }
        try { fs.unlinkSync(mediaPath) } catch {}
    } catch (error) {
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Failed to take screenshot. Please try again later._', edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: '_❌ Failed to take screenshot. Please try again later._', edit: publicMessage.key });
        }
        return;
    }
});