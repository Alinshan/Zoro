const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Converts an audio file to an Opus-encoded OGG file suitable for WhatsApp Voice Notes.
 * @param {string} inputPath - The path to the source audio file.
 * @returns {Promise<string>} - Resolves to the path of the converted .ogg file.
 */
function convertToOpus(inputPath) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(os.tmpdir(), `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.ogg`);
        
        ffmpeg(inputPath)
            .audioCodec('libopus')
            .audioBitrate('48k')
            .outputOptions([
                '-vbr on',
                '-compression_level 10',
                '-frame_duration 60',
                '-application voip'
            ])
            .toFormat('ogg')
            .on('end', () => {
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('[audioUtils] ffmpeg error:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

module.exports = { convertToOpus };
