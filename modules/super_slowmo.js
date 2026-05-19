const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const fs = require('fs');

addCommand({ pattern: "^slowmo ?(.*)", access: "all", desc: "_Make videos 240FPS slow motion._", usage: global.handlers[0] + "slowmo <fast || normal || quality>", warn: "_This command uses a lot of CPU power!_", pluginVersion: "1.0.0", pluginId: "slowmo" }, async (msg, match, sock, rawMessage) => {

    if (!global.database?.slowMoOptions) {
        global.database.slowMoOptions = {
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

    if (global.database.slowMoOptions.unlocked == false) {
        if (videoLength > global.database.slowMoOptions.maxLength) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video length is too long! Max length is " + global.database.slowMoOptions.maxLength + " seconds!_\n\n_To unlock slow motion limits, use " + global.handlers[0] + "slowmounlock_", edit: msg.key });
            } else {
                if (global.isSudo(msg.key.participant || msg.key.remoteJid)) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.slowMoOptions.maxWidth + " pixels!_\n\n_To unlock slow motion limits, use " + global.handlers[0] + "slowmounlock_"}, { quoted: rawMessage.messages[0] });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video length is too long! Max length is " + global.database.slowMoOptions.maxLength + " seconds!_\n\n_To unlock slow motion limits, please contact the bot owner!_" }, { quoted: rawMessage.messages[0] });
            }
        }
        if (width > global.database.slowMoOptions.maxWidth) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.slowMoOptions.maxWidth + " pixels!_\n\n_To unlock slow motion limits, use " + global.handlers[0] + "slowmounlock_", edit: msg.key });
            } else {
                if (global.isSudo(msg.key.participant || msg.key.remoteJid)) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.slowMoOptions.maxWidth + " pixels!_\n\n_To unlock slow motion limits, use " + global.handlers[0] + "slowmounlock_"}, { quoted: rawMessage.messages[0] });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.slowMoOptions.maxWidth + " pixels!_\n\n_To unlock slow motion limits, please contact the bot owner!_" }, { quoted: rawMessage.messages[0] });
            }
        }
        if (height > global.database.slowMoOptions.maxHeight) {
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video height is too big! Max height is " + global.database.slowMoOptions.maxHeight + " pixels!_\n\n_To unlock slow motion limits, use " + global.handlers[0] + "slowmounlock_", edit: msg.key });
            } else {
                if (global.isSudo(msg.key.participant || msg.key.remoteJid)) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video width is too big! Max width is " + global.database.slowMoOptions.maxWidth + " pixels!_\n\n_To unlock slow motion limits, use " + global.handlers[0] + "slowmounlock_"}, { quoted: rawMessage.messages[0] });
                }
                return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Video height is too big! Max height is " + global.database.slowMoOptions.maxHeight + " pixels!_\n\n_To unlock slow motion limits, please contact the bot owner!_" }, { quoted: rawMessage.messages[0] });
            }
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Applying slow motion.._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Applying slow motion.._" }, { quoted: rawMessage.messages[0] });
    }

    var slowPatch = "./src/slow" + Math.floor(Math.random() * 10000) + ".mp4"
    var slowPatch2 = "./src/slow2" + Math.floor(Math.random() * 10000) + ".mp4"
    await global.downloadMedia(msg.quotedMessage.videoMessage, "video", slowPatch);

    var msgInterv = 0
    var isDone = false
    var mode = match[1] || "normal";
    mode = mode.toLowerCase() == "normal" ? "normal" : mode.toLowerCase() == "fast" ? "fast" : "quality"

    ffmpeg(slowPatch)
    .videoFilter(
        mode == "normal" ? 'minterpolate=fps=240:mi_mode=mci:me_mode=bidir:me=tdls' :
        mode == "fast" ? "minterpolate=fps=240:mi_mode=mci:mc_mode=obmc:me_mode=bilat:me=epzs:search_param=8:vsbmc=0:scd=none" :
        "minterpolate=fps=240:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=tss:vsbmc=1:scd=fdiff:search_param=32"
    )
    .videoFilter("setpts=2.5*PTS")
    .videoCodec('libx264')
    .outputOptions(
        [
            '-preset', 'ultrafast',
            '-crf', mode == "normal" || mode == "fast" ? '22' : '17',
        ]
    )
    .noAudio()
    .format('mp4')
    .save(slowPatch2)
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
                    await sock.sendMessage(msg.key.remoteJid, { text: `_Applying slow motion (${modeName} Mode)..._\n\n_Progress: ${progress_percent}%_\n_Speed: ${progress.currentFps} FPS/s_`, edit: msg.key });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `_Applying slow motion (${modeName} Mode)..._\n\n_Progress: ${progress_percent}%_\n_Speed: ${progress.currentFps} FPS/s_`, edit: publicMessage.key });
                }
            } else {
                if (isDone == false) {
                    isDone = true
                    if (msg.key.fromMe) {
                        await sock.sendMessage(msg.key.remoteJid, { text: `_Applying slow motion (${modeName} Mode)..._\n\n_Decoding..._`, edit: msg.key });
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: `_Applying slow motion (${modeName} Mode)..._\n\n_Decoding..._`, edit: publicMessage.key });
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
            try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch {}
            await sock.sendMessage(msg.key.remoteJid, { video: { url: slowPatch2 }, caption: "_Slow motion applied! (" + modeName + " Mode)_" });
        } else {
            try { await sock.sendMessage(msg.key.remoteJid, { delete: publicMessage.key }); } catch {}
            await sock.sendMessage(msg.key.remoteJid, { video: { url: slowPatch2 }, caption: "_Slow motion applied! (" + modeName + " Mode)_" }, { quoted: rawMessage.messages[0] });
        }

        [slowPatch, slowPatch2].forEach(file => {
            try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch { }
        });
    })
})

addCommand({ pattern: "^slowmounlock$", access: "sudo", dontAddCommandList: true }, async (msg, match, sock, rawMessage) => {
    if (!global.database?.slowMoOptions) {
        global.database.slowMoOptions = {
            maxLength: 20,
            maxWidth: 800,
            maxHeight: 800,
            unlocked: false,
        };
    }

    if (global.database?.slowMoOptions.unlocked == true) {
        global.database.slowMoOptions.unlocked = false;
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Slow motion limits locked!_", edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Slow motion limits locked!_", edit: rawMessage.messages[0] });
        }
        return;
    } else {
        global.database.slowMoOptions.unlocked = true;
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Slow motion limits unlocked!_", edit: msg.key });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Slow motion limits unlocked!_", edit: rawMessage.messages[0] });
        }
    }
})

