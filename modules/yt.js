const ytdl = require("ytdl-core-enhanced");
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const axios = require('axios');
ffmpeg.setFfmpegPath(ffmpegPath);

const COBALT_INSTANCES = [
    'https://api.cobalt.blackcat.sweeux.org',
    'https://api.dl.woof.monster',
    'https://cobaltapi.squair.xyz',
    'https://cobaltapi.kittycat.boo'
];

async function downloadWithCobalt(videoUrl, audioOnly = false) {
    const payload = {
        url: videoUrl
    };
    if (audioOnly) {
        payload.downloadMode = 'audio';
    } else {
        payload.videoQuality = '720';
        payload.youtubeVideoCodec = 'h264';
    }

    for (const instance of COBALT_INSTANCES) {
        try {
            const res = await axios.post(instance, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });
            if (res.data && res.data.url) {
                return res.data;
            }
        } catch (e) {
            console.error(`[Cobalt] ${instance} failed:`, e.message);
        }
    }
    throw new Error('All Cobalt endpoints failed.');
}

function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}


addCommand( {pattern: "^video ?(.*)", access: "all", desc: "Download video from YouTube.", usage: global.handlers[0] + "video <query || url>" }, async (msg, match, sock, rawMessage) => {
    const query = match[1];
    if (!query) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a video to search for._", edit: msg.key });
        } else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a video to search for._"}, { quoted: rawMessage.messages[0] });
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Video Downloading.._", edit: msg.key });
    } else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Video Downloading.._"}, { quoted: rawMessage.messages[0] });
    }

    let videoId;
    if (query.match(/^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be|youtube\.com\/shorts)\/.+(\?.+)?$/)) {
        videoId = getYouTubeId(query);
        if (!videoId) {
            const errMsg = "_❌ Invalid YouTube URL format._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }
    } else {
        const ytVideo = await import('libmuse');
        
        const searchResults = await ytVideo.search(query);
        if (!searchResults || searchResults.length === 0) {
            const errMsg = "_❌ No results found for this query._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }

        const videos = searchResults.categories.find(x => x.title === "Videos");
        if (!videos || videos.results.length === 0) {
            const errMsg = "_❌ No videos found for this query._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }

        videoId = videos.results[0].videoId;
    }

    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
        console.log(`[Cobalt] Attempting video resolution for: ${targetUrl}`);
        const cobaltResult = await downloadWithCobalt(targetUrl, false);

        const mediaPath = `src/video` + (Math.floor(Math.random() * 1000)) + `.mp4`;
        const mp4Path = `src/video_converted` + (Math.floor(Math.random() * 1000)) + `.mp4`;

        // Download Cobalt direct stream locally to transcode
        const response = await axios({
            url: cobaltResult.url,
            method: 'GET',
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(mediaPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Standardize container and codec to H.264/AAC MP4
        await convertToMp4(mediaPath, mp4Path);
        
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: msg.key });
        } else if (publicMessage) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: publicMessage.key });
        }

        const messageOptions = {
            video: { url: mp4Path },
            caption: cobaltResult.filename || 'YouTube Video'
        };

        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, messageOptions);
        } else {
            await sock.sendMessage(msg.key.remoteJid, messageOptions, { quoted: rawMessage.messages[0] });
        }

        [mediaPath, mp4Path].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        });
    } catch (cobaltErr) {
        console.log(`[Cobalt failed: ${cobaltErr.message}], falling back to local ytdl-core-enhanced...`);
        try {
            var video = await ytdl.getInfo(targetUrl);
            const url = video.videoDetails.video_url;

            const mediaPath = `src/video` + (Math.floor(Math.random() * 1000)) + `.mp4`;
            const mp4Path = `src/video_converted` + (Math.floor(Math.random() * 1000)) + `.mp4`;

            const downloadSuccess = await downloadVideo(url, mediaPath, video.videoDetails.lengthSeconds);
            await convertToMp4(mediaPath, mp4Path);

            if (!downloadSuccess) {
                throw new Error("Failed to download via ytdl");
            }

            if (msg.key.fromMe) {
                await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: msg.key });
            } else if (publicMessage) {
                await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: publicMessage.key });
            }

            const messageOptions = {
                video: { url: mp4Path },
                caption: video.videoDetails.author.name + " - " + video.videoDetails.title
            };

            if (msg.key.fromMe) {
                await sock.sendMessage(msg.key.remoteJid, messageOptions);
            } else {
                await sock.sendMessage(msg.key.remoteJid, messageOptions, { quoted: rawMessage.messages[0] });
            }

            [mediaPath, mp4Path].forEach(file => {
                if (fs.existsSync(file)) fs.unlinkSync(file);
            });
        } catch (err) {
            console.error('[ytdl fallback failed too]', err.message);
            const errMsg = "_❌ Failed to download video. YouTube limits are currently blocking this download._";
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            } else {
                return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
            }
        }
    }

    return;
})


addCommand({ pattern: "^music ?(.*)", access: "all", desc: "Download music from YouTube.", usage: global.handlers[0] + "music <query || url>" }, async (msg, match, sock, rawMessage) => {
    const query = match[1];
    if (!query) {
        if (msg.key.fromMe) {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a music to search for._", edit: msg.key });
        }
        else {
            return await sock.sendMessage(msg.key.remoteJid, { text: "_❌ Please provide a music to search for._"}, { quoted: rawMessage.messages[0] });
        }
    }

    if (msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Music Downloading.._", edit: msg.key });
    }
    else {
        var publicMessage = await sock.sendMessage(msg.key.remoteJid, { text: "_⏳ Music Downloading.._"}, { quoted: rawMessage.messages[0] });
    }

    let url;
    if (query.match(/^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be|youtube\.com\/shorts)\/.+(\?.+)?$/)) {
        const videoId = getYouTubeId(query);
        if (!videoId) {
            const errMsg = "_❌ Invalid YouTube URL format._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }
        url = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
        const ytMusic = await import('libmuse');
        
        const searchResults = await ytMusic.search(query);
        if (!searchResults || searchResults.length === 0) {
            const errMsg = "_❌ No results found for this query._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }

        const songs = searchResults.categories.find(x => x.title === "Songs");
        if (!songs || songs.results.length === 0) {
            const errMsg = "_❌ No songs found for this query._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }

        const song = songs.results[0];
        if (!song) {
            const errMsg = "_❌ No song found for this query._";
            if (msg.key.fromMe) return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
        }
        url = `https://www.youtube.com/watch?v=${song.videoId}`;
    }

    try {
        console.log(`[Cobalt] Attempting music resolution for: ${url}`);
        const cobaltResult = await downloadWithCobalt(url, true);
        
        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: msg.key });
        } else if (publicMessage) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: publicMessage.key });
        }

        if (msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, { audio: { url: cobaltResult.url }, mimetype: 'audio/mp4' });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { audio: { url: cobaltResult.url }, mimetype: 'audio/mp4' }, { quoted: rawMessage.messages[0] });
        }
    } catch (cobaltErr) {
        console.log(`[Cobalt music failed: ${cobaltErr.message}], falling back to local ytdl-core-enhanced...`);
        try {
            const audioFilePath = "src/music" + Date.now() + ".mp3";
            const oggFilePath = "src/music" + Date.now() + ".ogg";

            const downloadSuccess = await downloadAudio(url, audioFilePath);
            if (!downloadSuccess) {
                throw new Error("Failed to download via ytdl");
            }

            await convertToOgg(audioFilePath, oggFilePath);

            if (msg.key.fromMe) {
                await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: msg.key });
            } else if (publicMessage) {
                await sock.sendMessage(msg.key.remoteJid, { text: "_✅ Done!_", edit: publicMessage.key });
            }

            if (msg.key.fromMe) {
                await sock.sendMessage(msg.key.remoteJid, { audio: { url: oggFilePath }, mimetype: 'audio/mp4' });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { audio: { url: oggFilePath }, mimetype: 'audio/mp4' }, { quoted: rawMessage.messages[0] });
            }

            [audioFilePath, oggFilePath].forEach(file => {
                if (fs.existsSync(file)) fs.unlinkSync(file);
            });
        } catch (err) {
            console.error('[ytdl music fallback failed too]', err.message);
            const errMsg = "_❌ Failed to download music. YouTube limits are currently blocking this download._";
            if (msg.key.fromMe) {
                return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: msg.key });
            } else {
                return await sock.sendMessage(msg.key.remoteJid, { text: errMsg, edit: publicMessage.key });
            }
        }
    }

    return;
})

/**
 * Downloads the audio from a YouTube video and saves it to a file.
 * @param {string} link - The URL of the YouTube video.
 * @param {string} file - The path to save the downloaded audio file.
 * @returns {Promise<boolean>} - A Promise that resolves to true if the download is successful, false otherwise.
 */
async function downloadAudio(link, file) {
    try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        const stream = ytdl(link, { "quality": "highestaudio", "filter": "audioonly" }).pipe(fs.createWriteStream(file));
        
        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });
        
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}


/**
 * Downloads a video from a YouTube link and saves it to a file.
 * @param {string} link - The URL of the YouTube video.
 * @param {string} file - The path to save the downloaded video file.
 * @param {number} duration - The length of the video in seconds.
 * @returns {Promise<boolean>} - A Promise that resolves to true if the download is successful, false otherwise.
 */
async function downloadVideo(link, file, duration) {
    try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        const stream = ytdl(link, { "quality": duration > 300 ? "lowestVideo" : "highestvideo", "filter": "audioandvideo" }).pipe(fs.createWriteStream(file));
        
        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });
        
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}


/**
 * Converts a video file to OGG format.
 * @param {string} file - The path to the video file to convert.
 * @param {string} output - The path to save the converted video file.
 * @returns {Promise<void>} - A Promise that resolves when the conversion is complete.
 */
async function convertToOgg(file, output) {
    return new Promise((resolve, reject) => {
      ffmpeg(file)
        .outputOptions('-avoid_negative_ts', 'make_zero', '-ac', '1', '-qscale:a', '0')
        .audioBitrate('192k')
        .output(output)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
}

/**
 * Converts a video file to MP4 format.
 * @param {string} file - The path to the video file to convert.
 * @param {string} output - The path to save the converted video file.
 * @returns {Promise<void>} - A Promise that resolves when the conversion is complete.
 */
async function convertToMp4(file, output) {
    return new Promise((resolve, reject) => {
      ffmpeg(file)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions('-preset', 'ultrafast', '-crf', '28', '-movflags', '+faststart')
        .output(output)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
}