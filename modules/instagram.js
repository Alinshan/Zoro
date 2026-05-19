/**
 * @module instagram
 * Downloads Instagram Reels, Posts using instagram-url-direct
 */

const igDL = require('instagram-url-direct');

/**
 * Downloads Instagram media using instagram-url-direct.
 */
async function downloadInstagram(rawUrl) {
    const cleanUrl = rawUrl.split('?')[0];
    
    try {
        const res = await igDL.instagramGetUrl(cleanUrl);
        if (!res || !res.url_list || res.url_list.length === 0) {
            throw new Error('No media found or post is private.');
        }

        if (res.url_list.length > 1) {
            return {
                type: 'picker',
                urls: res.url_list.map((url, i) => {
                    const type = res.media_details?.[i]?.type === 'video' || url.includes('.mp4') ? 'video' : 'image';
                    return { type, url };
                })
            };
        } else {
            const url = res.url_list[0];
            const type = res.media_details?.[0]?.type === 'video' || url.includes('.mp4') ? 'video' : 'image';
            return { type, url };
        }
    } catch (err) {
        throw new Error(`Failed to download: ${err.message}`);
    }
}

// ─── .insta command ──────────────────────────────────────────────────────────

addCommand({ pattern: "^insta ?(.*)", desc: "Download videos/images from Instagram Reels or Posts.", access: "all" }, async (msg, match, sock, rawMessage) => {

    if (!match[1]) {
        const text = "_Please provide an Instagram URL.\nExample: `.insta https://www.instagram.com/reel/xxxxx`_";
        if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text, edit: msg.key });
        return await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: rawMessage.messages[0] });
    }

    let statusMsg;
    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_📥 Downloading from Instagram..._", edit: msg.key });
    } else {
        statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: "_📥 Downloading from Instagram..._" }, { quoted: rawMessage.messages[0] });
    }

    try {
        const result = await downloadInstagram(match[1].trim());
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: msg.key });
        } else if (statusMsg) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: statusMsg.key });
        }

        const sendMedia = async (item) => {
            const payload = item.type === 'video'
                ? { video: { url: item.url } }
                : { image: { url: item.url } };
            if (msg.key.fromMe) await sock.sendMessage(msg.key.remoteJid, payload);
            else await sock.sendMessage(msg.key.remoteJid, payload, { quoted: rawMessage.messages[0] });
        };

        if (result.type === 'picker') {
            for (const item of result.urls) await sendMedia(item);
        } else {
            await sendMedia(result);
        }

    } catch (err) {
        console.error('[Instagram] All methods failed:', err.message);
        const errText = `_❌ Failed to download. The post must be public to download._`;
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