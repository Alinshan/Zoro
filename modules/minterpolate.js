const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const fs = require('fs');

addCommand({ pattern: "^interp ?(.*)", access: "all", desc: "_Interpolate a video. Make vidoes more smooth._", usage: global.handlers[0] + "interp <fast || normal || quality>", warn: "_This command uses a lot of CPU power!_", pluginVersion: "1.0.4", pluginId: "minterpolate" }, async (msg, match, sock, rawMessage) => {

    if (!global.database?.interpOptions) {
        global.database.interpOptions = {
            maxLength: 15,
            maxWidth: 800,
            maxHeight: 800,
            unlocked: false,
        };
}

    if (!msg.quotedMessage || !msg.quotedMessage?.videoMessage) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please reply an video!_", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please reply an video!_" }, { quoted: rawMessage.messages[0] });
        }
    }

    var videoLength = msg.quotedMessage.videoMessage.seconds;
    var { width, height } = msg.quotedMessage.videoMessage;

    if (global.database.interpOptions.unlocked == false) {
        if (videoLength > global.database.interpOptions.maxLength) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video length is too long! Max length is " + global.database.interpOptions.maxLength + " seconds!_\n\n_To unlock interpolation limits, use " + global.handlers[0] + "interpunlock_", edit: msg.key });
            } else {
                if (global.isSudo(msg.key.participant || msg.key.remoteJid)) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.interpOptions.maxWidth + " pixels!_\n\n_To unlock interpolation limits, use " + global.handlers[0] + "interpunlock_"}, { quoted: rawMessage.messages[0] });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video length is too long! Max length is " + global.database.interpOptions.maxLength + " seconds!_\n\n_To unlock interpolation limits, please contact the bot owner!_" }, { quoted: rawMessage.messages[0] });
            }
        }
        if (width > global.database.interpOptions.maxWidth) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.interpOptions.maxWidth + " pixels!_\n\n_To unlock interpolation limits, use " + global.handlers[0] + "interpunlock_", edit: msg.key });
            } else {
                if (global.isSudo(msg.key.participant || msg.key.remoteJid)) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.interpOptions.maxWidth + " pixels!_\n\n_To unlock interpolation limits, use " + global.handlers[0] + "interpunlock_"}, { quoted: rawMessage.messages[0] });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.interpOptions.maxWidth + " pixels!_\n\n_To unlock interpolation limits, please contact the bot owner!_" }, { quoted: rawMessage.messages[0] });
            }
        }
        if (height > global.database.interpOptions.maxHeight) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video height is too big! Max height is " + global.database.interpOptions.maxHeight + " pixels!_\n\n_To unlock interpolation limits, use " + global.handlers[0] + "interpunlock_", edit: msg.key });
            } else {
                if (global.isSudo(msg.key.participant || msg.key.remoteJid)) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.interpOptions.maxWidth + " pixels!_\n\n_To unlock interpolation limits, use " + global.handlers[0] + "interpunlock_"}, { quoted: rawMessage.messages[0] });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video height is too big! Max height is " + global.database.interpOptions.maxHeight + " pixels!_\n\n_To unlock interpolation limits, please contact the bot owner!_" }, { quoted: rawMessage.messages[0] });
            }
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Interpolating to 60FPS.._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Interpolating to 60FPS.._" }, { quoted: rawMessage.messages[0] });
    }

    var interpPath = "./src/interp" + Math.floor(Math.random() * 10000) + ".mp4"
    var interpPath2 = "./src/interp2" + Math.floor(Math.random() * 10000) + ".mp4"
    await global.downloadMedia(msg.quotedMessage.videoMessage, "video", interpPath);

    var msgInterv = 0
    var isDone = false
    var mode = match[1] || "normal";
    mode = mode.toLowerCase() == "normal" ? "normal" : mode.toLowerCase() == "fast" ? "fast" : "quality"

    ffmpeg(interpPath)
    .videoFilter(
        mode == "normal" ? 'minterpolate=fps=60:mi_mode=mci:me_mode=bidir:me=tdls' :
        mode == "fast" ? "minterpolate=fps=60:mi_mode=mci:mc_mode=obmc:me_mode=bilat:me=epzs:search_param=8:vsbmc=0:scd=none" :
        "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=tss:vsbmc=1:scd=fdiff:search_param=32"
    )
    .videoCodec('libx264')
    .outputOptions(
        [
            '-preset', 'ultrafast',
            '-crf', mode == "normal" || mode == "fast" ? '22' : '17',
        ]
    )
    .audioCodec('copy')
    .format('mp4')
    .save(interpPath2)
    .on("progress", async (progress) => {
        if (msgInterv >= 2) {
            msgInterv = 0
            var timemarkParts = progress.timemark.split(':');
            var seconds = (+timemarkParts[0]) * 60 * 60 + (+timemarkParts[1]) * 60 + (+timemarkParts[2].split('.')[0]) + (+timemarkParts[2].split('.')[1] / 100);
            var progress_percent = ((seconds / videoLength) * 100).toFixed(2);        
            progress_percent = progress_percent >= 100 ? 100 : progress_percent;
            var modeName = mode == "normal" ? "Normal" : mode == "fast" ? "Fast" : "Quality"

            if (progress_percent < 100) {
                if (msg.key.fromMe) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `_Interpolating to 60FPS (${modeName} Mode)..._\n\n_Progress: ${progress_percent}%_\n_Speed: ${progress.currentFps} FPS/s_`, edit: msg.key });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `_Interpolating to 60FPS (${modeName} Mode)..._\n\n_Progress: ${progress_percent}%_\n_Speed: ${progress.currentFps} FPS/s_`, edit: publicMessage.key });
                }
            } else {
                if (isDone == false) {
                    isDone = true
                    if (msg.key.fromMe) {
                        await sock.sendMessage(msg.key.remoteJid, { text: `_Interpolating to 60FPS (${modeName} Mode)..._\n\n_Decoding..._`, edit: msg.key });
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: `_Interpolating to 60FPS (${modeName} Mode)..._\n\n_Decoding..._`, edit: publicMessage.key });
                    }
                }
            }
            
        } else {
            msgInterv++
        }
    })
    .on("end", async () => {
        var modeName = mode == "normal" ? "Normal" : mode == "fast" ? "Fast" : "Quality"

        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { video: { url: interpPath2 }, caption: "_Interpolated video to 60FPS! (" + modeName + " Mode)_" });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { video: { url: interpPath2 }, caption: "_Interpolated video to 60FPS! (" + modeName + " Mode)_" }, { quoted: rawMessage.messages[0] });
        }

        [interpPath, interpPath2].forEach(file => {
            try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch { }
        });
    })
})

addCommand({ pattern: "^interpunlock$", access: "sudo", dontAddCommandList: true }, async (msg, match, sock, rawMessage) => {
    if (!global.database?.interpOptions) {
        global.database.interpOptions = {
            maxLength: 20,
            maxWidth: 800,
            maxHeight: 800,
            unlocked: false,
        };
    }

    if (global.database?.interpOptions.unlocked == true) {
        global.database.interpOptions.unlocked = false;
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Interpolation limits locked!_", edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Interpolation limits locked!_", edit: rawMessage.messages[0] });
        }
        return;
    } else {
        global.database.interpOptions.unlocked = true;
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Interpolation limits unlocked!_", edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Interpolation limits unlocked!_", edit: rawMessage.messages[0] });
        }
    }
})

