const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const axios = require('axios');

var randomAvatars = [
    "https://api.dicebear.com/9.x/adventurer/png?seed=",
    "https://api.dicebear.com/9.x/adventurer-neutral/png?seed=",
    "https://api.dicebear.com/9.x/avataaars-neutral/png?seed=",
    "https://api.dicebear.com/9.x/big-ears/png?seed=",
    "https://api.dicebear.com/9.x/big-ears-neutral/png?seed=",
    "https://api.dicebear.com/9.x/avataaars/png?seed=",
    "https://api.dicebear.com/9.x/big-smile/png?seed=",
    "https://api.dicebear.com/9.x/bottts/png?seed=",
    "https://api.dicebear.com/9.x/bottts-neutral/png?seed=",
    "https://api.dicebear.com/9.x/croodles/png?seed=",
    "https://api.dicebear.com/9.x/dylan/png?seed=",
    "https://api.dicebear.com/9.x/micah/png?seed="
]

addCommand({ pattern: "^avatar$", access: "all", desc: "_Get a random avatar from DiceBear._", pluginVersion: "1.0.0", pluginId: "dicebear" }, async (msg, match, sock, rawMessage) => {
    const groupId = msg.key.remoteJid;
    const randomAvatar = randomAvatars[Math.floor(Math.random() * randomAvatars.length)];
    const seed = Math.floor(Math.random() * Math.pow(2, 32));
    const avatarUrl = randomAvatar + seed;

    if (msg.key.fromMe) {
        await sock.sendMessage(groupId, { text: "_Generating Avatar..._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(groupId, { text: "_Generating Avatar..._" }, { quoted: rawMessage.messages[0] });
    }

    const response = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
    var mediaPath = "./src/avatar" + (Math.floor(Math.random() * 1000)) + ".png";
    var mediaPath2 = "./src/avatar_converted" + (Math.floor(Math.random() * 1000)) + ".png";
    fs.writeFileSync(mediaPath, response.data);

    ffmpeg(mediaPath).outputOptions(["-y", "-vcodec libwebp"]).videoFilters('scale=1500:1500:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=2000:2000:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1').save(mediaPath2).on('end', async () => {
        await global.addExif(mediaPath2, "© ᴢᴏʀᴏ ʙᴏᴛ", "© ᴢᴏʀᴏ ʙᴏᴛ");
        await sock.sendMessage(groupId, { delete: msg.fromMe ? publicMessage.key : msg.key });
        await sock.sendMessage(groupId, { sticker: { url: mediaPath2 } });
        try {
            fs.unlinkSync(mediaPath);
            fs.unlinkSync(mediaPath2);
        } catch { }
    })
})