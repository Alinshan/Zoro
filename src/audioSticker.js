const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let protobuf;
try {
  protobuf = require('protobufjs/minimal');
} catch {
  try {
    protobuf = require('protobufjs');
  } catch {}
}

const MAX_AUDIO_SECONDS = 5;
const MAX_VIDEO_SECONDS = 5;
const DEFAULT_MEDIA_DIR = path.resolve(__dirname, '../media');
const DEFAULT_AUDIO_PATH = path.resolve(DEFAULT_MEDIA_DIR, 'audio_sticker.mp3');
const DEFAULT_CACHE_OGG = path.resolve(DEFAULT_MEDIA_DIR, '_cache_audio.ogg');

const pendingAudioStickers = new Map();
const embeddedAudios = new WeakMap();
const sentByBotIds = new Set();
const chatCustomAudios = new Map();

let audioCache = { mtimeMs: 0, duracao: MAX_AUDIO_SECONDS };
let hooksInstalled = false;
let globalProto = null;
let globalPrepareWAMedia = null;

// Determine binary commands
let ffmpegCmd = 'ffmpeg';
let ffprobeCmd = 'ffprobe';
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
    ffmpegCmd = ffmpegInstaller.path;
  }
} catch {}

// Helper to encode tag + length-delimited bytes in protobuf wire format (fieldNo, wireType 2)
function encodeTagAndBytes(fieldNo, bytesBuf) {
  let v = ((fieldNo << 3) | 2) >>> 0;
  const tagBytes = [];
  while (v > 0x7f) {
    tagBytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  tagBytes.push(v & 0x7f);

  let len = bytesBuf.length >>> 0;
  const lenBytes = [];
  while (len > 0x7f) {
    lenBytes.push((len & 0x7f) | 0x80);
    len >>>= 7;
  }
  lenBytes.push(len & 0x7f);

  return Buffer.concat([Buffer.from(tagBytes), Buffer.from(lenBytes), bytesBuf]);
}

function lerCamposBytes(buf, targetFieldNo) {
  if (protobuf?.Reader) {
    const results = [];
    try {
      const r = protobuf.Reader.create(buf);
      while (r.pos < r.len) {
        const tag = r.uint32();
        const fieldNo = tag >>> 3;
        const wireType = tag & 7;
        if (fieldNo === targetFieldNo && wireType === 2) {
          results.push(r.bytes());
        } else {
          r.skipType(wireType);
        }
      }
      return results;
    } catch {}
  }

  // Pure JavaScript Protobuf reader fallback
  const results = [];
  let pos = 0;
  const len = buf.length;
  while (pos < len) {
    let tag = 0;
    let shift = 0;
    while (pos < len) {
      const b = buf[pos++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const fieldNo = tag >>> 3;
    const wireType = tag & 7;

    if (wireType === 0) {
      while (pos < len && (buf[pos++] & 0x80) !== 0) {}
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 2) {
      let length = 0;
      let lshift = 0;
      while (pos < len) {
        const lb = buf[pos++];
        length |= (lb & 0x7f) << lshift;
        if ((lb & 0x80) === 0) break;
        lshift += 7;
      }
      const end = pos + length;
      if (fieldNo === targetFieldNo) {
        results.push(buf.subarray(pos, end));
      }
      pos = end;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      break;
    }
  }
  return results;
}

function extrairAudioEmbutidoTag134(proto, futureProofBytes) {
  try {
    for (const innerBytes of lerCamposBytes(futureProofBytes, 1)) {
      for (const stickerBytes of lerCamposBytes(innerBytes, 26)) {
        for (const audioBytes of lerCamposBytes(stickerBytes, 26)) {
          return proto.Message.AudioMessage.decode(audioBytes);
        }
      }
    }
  } catch {}
  return null;
}

function extrairStickerDeTag134(proto, rawBytes) {
  for (const futureProofBytes of lerCamposBytes(rawBytes, 134)) {
    try {
      const fp = proto.Message.FutureProofMessage.decode(futureProofBytes);
      if (fp?.message?.stickerMessage) {
        const audioMsg = extrairAudioEmbutidoTag134(proto, futureProofBytes);
        if (audioMsg) {
          embeddedAudios.set(fp.message.stickerMessage, audioMsg);
        }
        return fp.message.stickerMessage;
      }
    } catch {}
  }
  return null;
}

/**
 * Installs Protobuf encode & decode hooks on Baileys proto.Message.
 */
function createMinimalWriter() {
  const chunks = [];
  return {
    uint32(val) {
      let v = val >>> 0;
      const b = [];
      while (v > 0x7f) {
        b.push((v & 0x7f) | 0x80);
        v >>>= 7;
      }
      b.push(v & 0x7f);
      chunks.push(Buffer.from(b));
      return this;
    },
    bytes(buf) {
      let len = buf.length >>> 0;
      const b = [];
      while (len > 0x7f) {
        b.push((len & 0x7f) | 0x80);
        len >>>= 7;
      }
      b.push(len & 0x7f);
      chunks.push(Buffer.from(b));
      chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
      return this;
    },
    finish() {
      return Buffer.concat(chunks);
    }
  };
}

function installProtobufHooks(proto) {
  if (hooksInstalled || !proto?.Message) return;
  hooksInstalled = true;
  globalProto = proto;

  // Hook on encode: wraps stickerMessage into tag 134 -> 1 -> 26 -> [sticker + 26: audio]
  const origEncode = proto.Message.encode.bind(proto.Message);
  proto.Message.encode = function (message, writer) {
    const sha = message?.stickerMessage?.fileSha256;
    const key = sha ? Buffer.from(sha).toString('base64') : null;

    if (key && pendingAudioStickers.has(key)) {
      const audioMsg = pendingAudioStickers.get(key);
      const w = writer || (protobuf?.Writer ? protobuf.Writer.create() : createMinimalWriter());

      const stickerBuf = proto.Message.StickerMessage.encode(message.stickerMessage).finish();
      const audioBuf = proto.Message.AudioMessage.encode(audioMsg).finish();

      const stickerComAudio = Buffer.concat([
        stickerBuf,
        encodeTagAndBytes(26, audioBuf)
      ]);

      const innerMessage = encodeTagAndBytes(26, stickerComAudio);
      const futureProof = encodeTagAndBytes(1, innerMessage);

      if (w && typeof w.uint32 === 'function' && typeof w.bytes === 'function') {
        w.uint32((134 << 3) | 2).bytes(futureProof);
      }

      const resto = { ...message };
      delete resto.stickerMessage;
      origEncode(resto, w);

      return w;
    }

    return origEncode(message, writer);
  };

  // Hook on decode: extracts stickerMessage and embedded audio from tag 134
  const origDecode = proto.Message.decode.bind(proto.Message);
  proto.Message.decode = function (reader, length, endTag) {
    let rawBytes = null;
    let startPos = 0;

    if (reader instanceof Uint8Array) {
      rawBytes = length === undefined ? reader : reader.subarray(0, length);
    } else if (reader && reader.buf instanceof Uint8Array) {
      startPos = reader.pos;
    }

    const decoded = origDecode(reader, length, endTag);

    if (!decoded.stickerMessage) {
      if (!rawBytes && reader && reader.buf instanceof Uint8Array) {
        rawBytes = reader.buf.subarray(startPos, reader.pos);
      }
      if (rawBytes && rawBytes.length > 0) {
        try {
          const sticker = extrairStickerDeTag134(proto, rawBytes);
          if (sticker) {
            decoded.stickerMessage = sticker;
          }
        } catch {}
      }
    }

    return decoded;
  };

  console.log('✅ [AudioSticker] Protobuf hooks installed successfully.');
}

async function getAudioDuration(file) {
  try {
    const { stdout } = await execFileAsync(ffprobeCmd, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file
    ]);
    return Math.max(1, Math.round(parseFloat(stdout.trim())));
  } catch {
    return MAX_AUDIO_SECONDS;
  }
}

async function convertToOggOpus(inPath, outOgg, maxSeconds = MAX_AUDIO_SECONDS) {
  await execFileAsync(ffmpegCmd, [
    '-y', '-i', inPath, '-vn', '-t', String(maxSeconds),
    '-c:a', 'libopus', '-b:a', '64k', '-ac', '1', '-ar', '48000',
    '-avoid_negative_ts', 'make_zero',
    outOgg
  ]);
  return await getAudioDuration(outOgg);
}

async function videoHasAudio(inPath) {
  try {
    const { stdout } = await execFileAsync(ffprobeCmd, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inPath
    ]);
    return stdout.trim() === 'audio';
  } catch {
    return false;
  }
}

async function ensureDefaultAudio() {
  let audioPath = DEFAULT_AUDIO_PATH;
  if (!fs.existsSync(audioPath)) {
    const somPath = path.resolve(DEFAULT_MEDIA_DIR, 'som.mp3');
    if (fs.existsSync(somPath)) {
      audioPath = somPath;
    } else {
      throw new Error(`Default audio not found in ${DEFAULT_MEDIA_DIR}`);
    }
  }

  const stat = fs.statSync(audioPath);
  if (fs.existsSync(DEFAULT_CACHE_OGG) && audioCache.mtimeMs === stat.mtimeMs) {
    return { oggPath: DEFAULT_CACHE_OGG, duracao: audioCache.duracao };
  }

  const duracao = await convertToOggOpus(audioPath, DEFAULT_CACHE_OGG, MAX_AUDIO_SECONDS);
  audioCache = { mtimeMs: stat.mtimeMs, duracao };
  return { oggPath: DEFAULT_CACHE_OGG, duracao };
}

function scaleFilter(mode = 'full', isVideo = false) {
  const fps = isVideo ? 'fps=15,' : '';
  const m = String(mode).toLowerCase();
  if (m === 'direita' || m === 'right') {
    return `${fps}scale=512:512:force_original_aspect_ratio=increase,crop=512:512:iw-512:0`;
  }
  // square, center, crop, centro, corte — all center-crop (no padding, no black bars)
  if (m === 'square' || m === 'centro' || m === 'center' || m === 'corte' || m === 'crop') {
    return `${fps}scale=512:512:force_original_aspect_ratio=increase,crop=512:512`;
  }
  // round — center-crop, circular mask applied separately via imageToWebpRound
  if (m === 'round' || m === 'circle' || m === 'circular') {
    return `${fps}scale=512:512:force_original_aspect_ratio=increase,crop=512:512`;
  }
  // full/default — center-crop to avoid black bars (images from gallery)
  // Previously used pad with transparent color but WhatsApp renders alpha as black
  return `${fps}scale=512:512:force_original_aspect_ratio=increase,crop=512:512`;
}

async function imageToWebp(inPath, outWebp, mode = 'full') {
  const m = String(mode).toLowerCase();
  if (m === 'round' || m === 'circle' || m === 'circular') {
    return imageToWebpRound(inPath, outWebp);
  }
  await execFileAsync(ffmpegCmd, [
    '-y', '-i', inPath,
    '-vf', scaleFilter(mode, false),
    '-vcodec', 'libwebp', '-lossless', '1',
    outWebp
  ]);
}

/**
 * Converts an image to a round (circular) WebP sticker using FFmpeg's geq filter.
 */
async function imageToWebpRound(inPath, outWebp) {
  // Scale to 512x512 center-crop first, then apply circular alpha mask
  const circleFilter = [
    'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
    'format=rgba',
    'geq=r=\'r(X,Y)\':g=\'g(X,Y)\':b=\'b(X,Y)\':a=\'if(lte(pow(X-256,2)+pow(Y-256,2),pow(256,2)),255,0)\''
  ].join(',');
  await execFileAsync(ffmpegCmd, [
    '-y', '-i', inPath,
    '-vf', circleFilter,
    '-vcodec', 'libwebp', '-lossless', '1',
    outWebp
  ]);
}

async function videoToAnimatedWebp(inPath, outWebp, mode = 'full') {
  // For animated WebP, always use center-crop (pad causes black bars in animated stickers)
  const videoMode = (mode === 'full') ? 'square' : mode;
  await execFileAsync(ffmpegCmd, [
    '-y', '-i', inPath, '-t', String(MAX_VIDEO_SECONDS),
    '-vf', scaleFilter(videoMode, true),
    '-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '6',
    '-q:v', '60', '-loop', '0', '-preset', 'picture', '-an', '-vsync', '0',
    outWebp
  ]);

  if (fs.existsSync(outWebp) && fs.statSync(outWebp).size > 490 * 1024) {
    const filtroMenor = scaleFilter(mode, true).replace('fps=15', 'fps=10');
    await execFileAsync(ffmpegCmd, [
      '-y', '-i', inPath, '-t', '4',
      '-vf', filtroMenor,
      '-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '6',
      '-q:v', '30', '-loop', '0', '-preset', 'picture', '-an', '-vsync', '0',
      outWebp
    ]);
    return 4;
  }
  return MAX_VIDEO_SECONDS;
}

function unwrapMessage(msg) {
  let cur = msg;
  while (cur) {
    if (cur.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
    else if (cur.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
    else if (cur.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
    else if (cur.viewOnceMessageV2Extension?.message) cur = cur.viewOnceMessageV2Extension.message;
    else if (cur.documentWithCaptionMessage?.message) cur = cur.documentWithCaptionMessage.message;
    else break;
  }
  return cur;
}

function extractContextInfo(content) {
  if (!content) return null;
  const unwrapped = unwrapMessage(content);
  for (const key of ['extendedTextMessage', 'stickerMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage']) {
    if (unwrapped?.[key]?.contextInfo) return unwrapped[key].contextInfo;
  }
  return null;
}

function extractVisualMedia(content) {
  const unwrapped = unwrapMessage(content);
  if (unwrapped?.stickerMessage) return { type: 'stickerMessage', media: unwrapped.stickerMessage };
  if (unwrapped?.imageMessage) return { type: 'imageMessage', media: unwrapped.imageMessage };
  if (unwrapped?.videoMessage) return { type: 'videoMessage', media: unwrapped.videoMessage };
  return null;
}

function extractAudioSource(content) {
  const unwrapped = unwrapMessage(content);
  if (unwrapped?.audioMessage) {
    return { msgContent: { audioMessage: unwrapped.audioMessage }, isVideo: false, label: 'audio' };
  }
  if (unwrapped?.documentMessage?.mimetype?.startsWith('audio/')) {
    return { msgContent: { documentMessage: unwrapped.documentMessage }, isVideo: false, label: 'audio document' };
  }
  if (unwrapped?.videoMessage) {
    return { msgContent: { videoMessage: unwrapped.videoMessage }, isVideo: true, label: 'video audio' };
  }
  if (unwrapped?.stickerMessage && embeddedAudios.has(unwrapped.stickerMessage)) {
    return { msgContent: { audioMessage: embeddedAudios.get(unwrapped.stickerMessage) }, isVideo: false, label: 'sticker audio' };
  }
  return null;
}

async function downloadMediaBuffer(sock, messageRef, content) {
  const unwrapped = unwrapMessage(content);
  const mediaType = ['stickerMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage']
    .find((type) => unwrapped?.[type]);
  const media = mediaType ? unwrapped[mediaType] : null;

  let baileysDownload;
  try {
    const b = await import('@whiskeysockets/baileys');
    baileysDownload = b.downloadMediaMessage;
  } catch {}

  if (baileysDownload) {
    try {
      return await baileysDownload(
        { ...messageRef, message: unwrapped },
        'buffer',
        {},
        { logger: { level: () => {}, trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }, reuploadRequest: sock.updateMediaMessage }
      );
    } catch (err) {
      if (media?.directPath) {
        const dp = media.directPath.startsWith('/') ? media.directPath : `/${media.directPath}`;
        const fallbackUrl = `https://mmg.whatsapp.net${dp}`;
        const fallbackContent = {
          ...unwrapped,
          [mediaType]: {
            ...media,
            directPath: dp,
            url: fallbackUrl
          }
        };
        return await baileysDownload(
          { ...messageRef, message: fallbackContent },
          'buffer',
          {},
          { logger: { level: () => {}, trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }, reuploadRequest: sock.updateMediaMessage }
        );
      }
      throw err;
    }
  }

  // Fallback to global.downloadMedia if present
  if (global.downloadMedia && media) {
    const tempFile = path.resolve(os.tmpdir(), `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const shortType = mediaType.replace('Message', '');
    await global.downloadMedia(media, shortType, tempFile);
    const buf = fs.readFileSync(tempFile);
    try { fs.unlinkSync(tempFile); } catch {}
    return buf;
  }

  throw new Error('No media downloader available in Baileys.');
}

/**
 * Prepares and sends an Audio Sticker over WhatsApp.
 */
async function sendAudioSticker(sock, jid, options = {}) {
  const {
    webpPath,
    isAnimated = false,
    audioInfo = null,
    quoted = null,
    packname = '© ᴢᴏʀᴏ ʙᴏᴛ',
    author = '© ᴢᴏʀᴏ ʙᴏᴛ'
  } = options;

  let prepareMedia = globalPrepareWAMedia;
  if (!prepareMedia) {
    const b = await import('@whiskeysockets/baileys');
    prepareMedia = b.prepareWAMessageMedia;
    globalPrepareWAMedia = prepareMedia;
    if (b.proto && !hooksInstalled) {
      installProtobufHooks(b.proto);
    }
  }

  // Add EXIF to webp before uploading if helper exists
  if (global.addExif && webpPath) {
    try {
      await global.addExif(webpPath, packname, author);
    } catch (e) {
      console.warn('[AudioSticker] EXIF injection notice:', e.message);
    }
  }

  if (!audioInfo) {
    throw new Error('No audioInfo provided for sendAudioSticker');
  }
  const { oggPath, duracao } = audioInfo;

  const stickerMedia = await prepareMedia(
    { sticker: { url: webpPath } },
    { upload: sock.waUploadToServer }
  );

  const audioMedia = await prepareMedia(
    { audio: { url: oggPath }, mimetype: 'audio/ogg; codecs=opus', ptt: false },
    { upload: sock.waUploadToServer }
  );

  stickerMedia.stickerMessage.width = 512;
  stickerMedia.stickerMessage.height = 512;
  stickerMedia.stickerMessage.isAnimated = Boolean(isAnimated);
  stickerMedia.stickerMessage.stickerSentTs = Date.now();
  stickerMedia.stickerMessage.isAvatar = false;
  stickerMedia.stickerMessage.isAiSticker = false;
  stickerMedia.stickerMessage.isLottie = false;

  if (!audioMedia.audioMessage.seconds) {
    audioMedia.audioMessage.seconds = duracao;
  }

  if (quoted?.key?.id) {
    stickerMedia.stickerMessage.contextInfo = {
      stanzaId: quoted.key.id,
      participant: quoted.key.participant || quoted.key.remoteJid,
      quotedMessage: unwrapMessage(quoted.message)
    };
  }

  const key = Buffer.from(stickerMedia.stickerMessage.fileSha256).toString('base64');
  const messageId = '3EB0' + crypto.randomBytes(9).toString('hex').toUpperCase();

  sentByBotIds.add(messageId);
  pendingAudioStickers.set(key, audioMedia.audioMessage);

  try {
    await sock.relayMessage(
      jid,
      { stickerMessage: stickerMedia.stickerMessage },
      { messageId }
    );
    console.log(`✅ [AudioSticker] Sent (${isAnimated ? 'animated' : 'static'}) to ${jid} | ID: ${messageId}`);
  } finally {
    pendingAudioStickers.delete(key);
    setTimeout(() => sentByBotIds.delete(messageId), 60000);
  }
}

function initAudioSticker({ proto, prepareWAMessageMedia } = {}) {
  if (proto) {
    installProtobufHooks(proto);
  }
  if (prepareWAMessageMedia) {
    globalPrepareWAMedia = prepareWAMessageMedia;
  }
}

module.exports = {
  initAudioSticker,
  installProtobufHooks,
  sendAudioSticker,
  getAudioDuration,
  convertToOggOpus,
  videoHasAudio,
  ensureDefaultAudio,
  scaleFilter,
  imageToWebp,
  imageToWebpRound,
  videoToAnimatedWebp,
  unwrapMessage,
  extractContextInfo,
  extractVisualMedia,
  extractAudioSource,
  downloadMediaBuffer,
  pendingAudioStickers,
  embeddedAudios,
  sentByBotIds,
  chatCustomAudios,
  DEFAULT_MEDIA_DIR,
  MAX_AUDIO_SECONDS,
  MAX_VIDEO_SECONDS
};
