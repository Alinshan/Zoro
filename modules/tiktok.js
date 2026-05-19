/**
 * @module tiktok
 * Downloads TikTok videos using the Cobalt API.
 * https://cobalt.tools — free, open-source, no API key required.
 */

const axios = require('axios');

const COBALT_API = 'https://api.cobalt.tools';

async function cobaltFetch(url) {
    const res = await axios.post(COBALT_API, { url }, {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        timeout: 20000
    });

    const data = res.data;
    if (data.status === 'error') throw new Error(data.error?.code || 'Cobalt API error.');
    if (data.status === 'redirect' || data.status === 'stream') return { type: 'video', url: data.url };
    if (data.status === 'picker') {
        return { type: 'picker', urls: data.picker.map(item => ({ type: item.type, url: item.url })) };
    }
    throw new Error('Unexpected response from Cobalt API.');
}

addCommand({ pattern: "^tiktok ?(.*)", access: "all", desc: "Download video from TikTok.", usage: global.handlers[0] + "tiktok <url>" }, async (msg, match, sock, rawMessage) => {

    if (!match[1]) {
        const text = "_❌ Please provide a TikTok link!_";
        if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text, edit: msg.key });
        return await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: rawMessage.messages[0] });
    }

    let statusMsg;
    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Downloading TikTok..._", edit: msg.key });
    } else {
        statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Downloading TikTok..._" }, { quoted: rawMessage.messages[0] });
    }

    try {
        const result = await cobaltFetch(match[1].trim());

        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: msg.key });
        } else if (statusMsg) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: statusMsg.key });
        }

        if (result.type === 'video') {
            const payload = { video: { url: result.url } };
            if (msg.key.fromMe) await sock.sendMessage(msg.key.remoteJid, payload);
            else await sock.sendMessage(msg.key.remoteJid, payload, { quoted: rawMessage.messages[0] });

        } else if (result.type === 'picker') {
            for (const item of result.urls) {
                const payload = item.type === 'video' ? { video: { url: item.url } } : { image: { url: item.url } };
                if (msg.key.fromMe) await sock.sendMessage(msg.key.remoteJid, payload);
                else await sock.sendMessage(msg.key.remoteJid, payload, { quoted: rawMessage.messages[0] });
            }
        }

    } catch (err) {
        console.error('[TikTok] Error:', err.message);
        const errText = `_❌ Failed to download. Make sure the link is valid and the video is public._`;
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: errText, edit: msg.key });
        } else {
            if (statusMsg) {
                await sock.sendMessage(msg.key.remoteJid, { text: errText, edit: statusMsg.key });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: errText }, { quoted: rawMessage.messages[0] });
            }
        }
    }

    return;
});
