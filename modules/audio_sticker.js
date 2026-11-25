const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {
  sendAudioSticker,
  getAudioDuration,
  convertToOggOpus,
  videoHasAudio,
  ensureDefaultAudio,
  imageToWebp,
  videoToAnimatedWebp,
  unwrapMessage,
  extractContextInfo,
  extractVisualMedia,
  extractAudioSource,
  downloadMediaBuffer,
  chatCustomAudios,
  sentByBotIds,
  DEFAULT_MEDIA_DIR,
  MAX_AUDIO_SECONDS
} = require('../src/audioSticker');

// Initialize database entry for audioStickerChats if missing
if (!global.database.audioStickerChats) {
  global.database.audioStickerChats = [];
}

// Recent media tracking for smart pairing across consecutive messages
const chatRecentVisuals = new Map(); // jid -> { visual, ref, time }
const chatRecentAudios = new Map();  // jid -> { audioSource, ref, time }
const RECENT_MEDIA_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Helper to reply or edit message depending on fromMe
 */
async function sendFeedback(sock, msg, rawMessage, text, editKey = null) {
  const jid = msg.key.remoteJid;
  const quoteTarget = rawMessage?.messages?.[0] || msg;
  if (msg.key.fromMe) {
    if (editKey) {
      return await sock.sendMessage(jid, { text, edit: editKey });
    }
    return await sock.sendMessage(jid, { text, edit: msg.key });
  } else {
    if (editKey) {
      return await sock.sendMessage(jid, { text, edit: editKey });
    }
    return await sock.sendMessage(jid, { text }, { quoted: quoteTarget });
  }
}

/**
 * Main audio sticker creation routine
 */
async function processAndSendAudioSticker(sock, jid, mediaContent, messageRef, options = {}) {
  const uid = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const tmpIn = path.resolve(os.tmpdir(), `astk_in_${uid}`);
  const tmpWebp = path.resolve(os.tmpdir(), `astk_out_${uid}.webp`);
  const tmpAudioIn = path.resolve(os.tmpdir(), `astk_ain_${uid}`);
  const tmpOgg = path.resolve(os.tmpdir(), `astk_aout_${uid}.ogg`);

  try {
    const mode = options.mode || 'full';
    let isAnimated = false;
    let audioInfo = null;
    let durationLimit = MAX_AUDIO_SECONDS;

    if (mediaContent.localImage) {
      await imageToWebp(mediaContent.localImage, tmpWebp, mode);
      isAnimated = false;
    } else {
      const rawBuffer = await downloadMediaBuffer(sock, messageRef, mediaContent);
      const unwrapped = unwrapMessage(mediaContent);

      if (unwrapped?.stickerMessage) {
        if (unwrapped.stickerMessage.isLottie) {
          throw new Error('Lottie stickers are not supported for audio stickers.');
        }
        isAnimated = Boolean(unwrapped.stickerMessage.isAnimated) || rawBuffer.includes(Buffer.from('ANIM'));
        fs.writeFileSync(tmpWebp, rawBuffer);
      } else if (unwrapped?.imageMessage) {
        fs.writeFileSync(tmpIn, rawBuffer);
        await imageToWebp(tmpIn, tmpWebp, mode);
        isAnimated = false;
      } else if (unwrapped?.videoMessage) {
        fs.writeFileSync(tmpIn, rawBuffer);
        durationLimit = await videoToAnimatedWebp(tmpIn, tmpWebp, mode);
        isAnimated = true;

        // If user wants original audio or video has audio and no custom audio override
        const preferOriginal = options.forceOriginal || (!options.customAudioSource && !chatCustomAudios.has(jid));
        if (preferOriginal && (await videoHasAudio(tmpIn))) {
          const dur = await convertToOggOpus(tmpIn, tmpOgg, durationLimit);
          audioInfo = { oggPath: tmpOgg, duracao: dur };
        }
      } else {
        throw new Error('Unsupported visual media format.');
      }
    }

    // If explicit custom audio source is provided (e.g., from quoted audio or paired audio)
    if (!audioInfo && options.customAudioSource) {
      const audioSource = options.customAudioSource;
      const audioBuf = await downloadMediaBuffer(sock, options.customAudioMsg || messageRef, audioSource.msgContent);
      fs.writeFileSync(tmpAudioIn, audioBuf);
      if (!audioSource.isVideo || (await videoHasAudio(tmpAudioIn))) {
        const dur = await convertToOggOpus(tmpAudioIn, tmpOgg, durationLimit);
        audioInfo = { oggPath: tmpOgg, duracao: dur };
      }
    }

    // Check chat custom audio (.setaudio)
    if (!audioInfo && chatCustomAudios.has(jid)) {
      const savedAudio = chatCustomAudios.get(jid);
      if (fs.existsSync(savedAudio.oggPath)) {
        audioInfo = savedAudio;
      } else {
        chatCustomAudios.delete(jid);
      }
    }

    // Never attach unknown default voices — only user voice/audio
    if (!audioInfo) {
      throw new Error('NO_AUDIO_SOURCE');
    }

    // Send the final Audio Sticker
    await sendAudioSticker(sock, jid, {
      webpPath: tmpWebp,
      isAnimated,
      audioInfo,
      quoted: messageRef
    });

    return true;
  } finally {
    for (const f of [tmpIn, tmpWebp, tmpAudioIn, tmpOgg]) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND: .asticker (aliases: .audiosticker, .soundsticker, .as)
// ─────────────────────────────────────────────────────────────────────────────
addCommand({
  pattern: "^(asticker|audiosticker|soundsticker|as) ?(.*)",
  access: "all",
  desc: "_Create a WhatsApp Audio Sticker (figurinha com som) from image, video, sticker, or audio._",
  usage: ".asticker [square|round|center|right|original]"
}, async (msg, match, sock, rawMessage) => {
  const jid = msg.key.remoteJid;
  const args = (match[2] || '').trim().toLowerCase();

  // Mode detection — square & round added
  let mode = 'full';
  if (args.includes('square')) {
    mode = 'square';
  } else if (args.includes('round') || args.includes('circle')) {
    mode = 'round';
  } else if (args.includes('center') || args.includes('crop') || args.includes('centro') || args.includes('corte')) {
    mode = 'center';
  } else if (args.includes('right') || args.includes('direita')) {
    mode = 'right';
  }
  const forceOriginal = args.includes('original') || args.includes('keep');

  const contextInfo = extractContextInfo(msg.message);
  const quoted = contextInfo?.quotedMessage ? {
    key: {
      remoteJid: jid,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant
    },
    message: unwrapMessage(contextInfo.quotedMessage)
  } : null;

  // Case 1: Quoted message has visual media
  const quotedVisual = quoted ? extractVisualMedia(quoted.message) : null;
  // Case 2: Current message has visual media
  const currentVisual = extractVisualMedia(msg.message);

  // Check for audio source in quoted or current message
  const quotedAudio = quoted ? extractAudioSource(quoted.message) : null;
  const currentAudio = extractAudioSource(msg.message);

  let targetVisual = null;
  let targetVisualRef = null;
  let customAudioSource = null;
  let customAudioMsg = null;

  if (quotedVisual) {
    targetVisual = quotedVisual;
    targetVisualRef = quoted;
    if (currentAudio) {
      customAudioSource = currentAudio;
      customAudioMsg = msg;
    }
  } else if (currentVisual) {
    targetVisual = currentVisual;
    targetVisualRef = msg;
    if (quotedAudio) {
      customAudioSource = quotedAudio;
      customAudioMsg = quoted;
    }
  }

  // If user replied .asticker to a voice note / audio:
  if (quotedAudio && !targetVisual) {
    customAudioSource = quotedAudio;
    customAudioMsg = quoted;

    // Smart Pairing: Check if user recently sent an image in this chat!
    const recentVis = chatRecentVisuals.get(jid);
    if (recentVis && (Date.now() - recentVis.time < RECENT_MEDIA_TIMEOUT)) {
      targetVisual = recentVis.visual;
      targetVisualRef = recentVis.ref;
    } else {
      // Use Zoro logo as visual for standalone voice note
      const logoPath = path.resolve(__dirname, '../src/zoro_logo.png');
      if (fs.existsSync(logoPath)) {
        targetVisual = { type: 'localImage', media: logoPath };
        targetVisualRef = msg;
      }
    }
  }

  // If targetVisual is an image/sticker and has no audio, check if user sent a voice note recently!
  if (targetVisual && targetVisual.type !== 'videoMessage' && !customAudioSource) {
    if (!chatCustomAudios.has(jid)) {
      const recentAud = chatRecentAudios.get(jid);
      if (recentAud && (Date.now() - recentAud.time < RECENT_MEDIA_TIMEOUT)) {
        customAudioSource = recentAud.audioSource;
        customAudioMsg = recentAud.ref;
      }
    }
  }

  if (!targetVisual) {
    return await sendFeedback(
      sock,
      msg,
      rawMessage,
      `_❌ Please reply to an image, video, sticker, or voice note!_\n\n*Usage:* \`\`\`${global.handlers[0]}asticker [square|round|center|right|original]\`\`\``
    );
  }

  // Strictly check that audio exists — NEVER generate with unknown sounds!
  const isVideo = targetVisual.type === 'videoMessage';
  const hasAudioSource = customAudioSource || chatCustomAudios.has(jid) || isVideo;

  if (!hasAudioSource) {
    return await sendFeedback(
      sock,
      msg,
      rawMessage,
      `_❌ No voice note or audio found!_\n` +
      `_Zoro will only create audio stickers with YOUR voice note or audio._\n\n` +
      `*How to add audio to your sticker:*\n` +
      `1️⃣ Send an image, then send a voice note & reply \`${global.handlers[0]}asticker\`\n` +
      `2️⃣ Or reply to any voice note with \`${global.handlers[0]}asticker\` (pairs with your last photo)\n` +
      `3️⃣ Or set a permanent sound for this chat with \`${global.handlers[0]}setaudio\` (reply to audio)\n` +
      `4️⃣ Or reply to a video with sound`
    );
  }

  const waitMsg = await sendFeedback(sock, msg, rawMessage, '_⏳ Creating audio sticker..._');

  try {
    const mediaPayload = targetVisual.type === 'localImage'
      ? { localImage: targetVisual.media }
      : { [targetVisual.type]: targetVisual.media };

    await processAndSendAudioSticker(sock, jid, mediaPayload, targetVisualRef, {
      mode,
      forceOriginal,
      customAudioSource,
      customAudioMsg
    });

    if (waitMsg) {
      await sendFeedback(sock, msg, rawMessage, '_✅ Done!_', waitMsg.key);
    }
  } catch (err) {
    console.error('[asticker] Error:', err);
    if (err.message === 'NO_AUDIO_SOURCE') {
      await sendFeedback(sock, msg, rawMessage, `_❌ No audio source found! Please provide or reply to a voice note or audio._`, waitMsg?.key);
    } else {
      await sendFeedback(sock, msg, rawMessage, `_❌ Failed to create audio sticker: ${err.message}_`, waitMsg?.key);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND: .chataudio / .setaudio
// ─────────────────────────────────────────────────────────────────────────────
addCommand({
  pattern: "^(chataudio|setaudio) ?(.*)",
  access: "all",
  desc: "_Set or reset custom sound for audio stickers in this chat._",
  usage: ".chataudio [reset|default] (reply to audio or video)"
}, async (msg, match, sock, rawMessage) => {
  const jid = msg.key.remoteJid;
  const sub = (match[2] || '').trim().toLowerCase();

  // Reset chat audio
  if (['reset', 'default', 'padrao', 'padrão', 'limpar'].includes(sub)) {
    const existing = chatCustomAudios.get(jid);
    chatCustomAudios.delete(jid);
    if (existing?.oggPath && fs.existsSync(existing.oggPath)) {
      try { fs.unlinkSync(existing.oggPath); } catch {}
    }
    return await sendFeedback(sock, msg, rawMessage, '_🔊 Audio stickers in this chat restored to default sound._');
  }

  const contextInfo = extractContextInfo(msg.message);
  const quoted = contextInfo?.quotedMessage ? {
    key: {
      remoteJid: jid,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant
    },
    message: unwrapMessage(contextInfo.quotedMessage)
  } : null;

  const audioSource = quoted ? extractAudioSource(quoted.message) : extractAudioSource(msg.message);
  if (!audioSource) {
    return await sendFeedback(
      sock,
      msg,
      rawMessage,
      `_ℹ️ Reply to an audio, voice note, or video with \`\`\`${global.handlers[0]}setaudio\`\`\` to set it as this chat's sound._\n_Use \`\`\`${global.handlers[0]}setaudio reset\`\`\` to restore default sound._`
    );
  }

  const waitMsg = await sendFeedback(sock, msg, rawMessage, '_⏳ Downloading and preparing chat custom sound..._');

  const safeJid = jid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempRaw = path.resolve(os.tmpdir(), `chat_raw_${safeJid}_${Date.now()}`);
  const chatOgg = path.resolve(DEFAULT_MEDIA_DIR, `_chat_audio_${safeJid}.ogg`);

  try {
    const audioBuf = await downloadMediaBuffer(sock, quoted || msg, audioSource.msgContent);
    fs.writeFileSync(tempRaw, audioBuf);

    if (audioSource.isVideo && !(await videoHasAudio(tempRaw))) {
      return await sendFeedback(sock, msg, rawMessage, '_⚠️ Quoted video has no audio track!_', waitMsg?.key);
    }

    const duracao = await convertToOggOpus(tempRaw, chatOgg, MAX_AUDIO_SECONDS);
    chatCustomAudios.set(jid, { oggPath: chatOgg, duracao });

    await sendFeedback(
      sock,
      msg,
      rawMessage,
      `_🔊 Custom sound set for this chat (${duracao}s)! Subsequent audio stickers here will use this audio._\n_Use \`\`\`${global.handlers[0]}setaudio reset\`\`\` to revert._`,
      waitMsg?.key
    );
  } catch (err) {
    console.error('[chataudio] Error:', err);
    await sendFeedback(sock, msg, rawMessage, `_❌ Failed to set chat audio: ${err.message}_`, waitMsg?.key);
  } finally {
    if (fs.existsSync(tempRaw)) {
      try { fs.unlinkSync(tempRaw); } catch {}
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND: .resetaudio
// ─────────────────────────────────────────────────────────────────────────────
addCommand({
  pattern: "^(resetaudio)$",
  access: "all",
  desc: "_Reset chat custom audio to default sound._"
}, async (msg, match, sock, rawMessage) => {
  const jid = msg.key.remoteJid;
  const existing = chatCustomAudios.get(jid);
  chatCustomAudios.delete(jid);
  if (existing?.oggPath && fs.existsSync(existing.oggPath)) {
    try { fs.unlinkSync(existing.oggPath); } catch {}
  }
  return await sendFeedback(sock, msg, rawMessage, '_🔊 Custom audio removed. This chat now uses the default sound._');
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND: .audiofactory (aliases: .astickerauto)
// ─────────────────────────────────────────────────────────────────────────────
addCommand({
  pattern: "^(audiofactory|astickerauto) ?(.*)",
  access: "sudo",
  desc: "_Toggle auto audio-sticker factory for this chat._",
  usage: ".audiofactory [on|off]"
}, async (msg, match, sock, rawMessage) => {
  const jid = msg.key.remoteJid;
  const opt = (match[2] || '').trim().toLowerCase();

  if (!global.database.audioStickerChats) {
    global.database.audioStickerChats = [];
  }

  const isEnabled = global.database.audioStickerChats.includes(jid);

  if (opt === 'on' || opt === 'enable' || (!opt && !isEnabled)) {
    if (!isEnabled) {
      global.database.audioStickerChats.push(jid);
    }
    return await sendFeedback(
      sock,
      msg,
      rawMessage,
      `_🟢 Audio Sticker Factory *ENABLED* in this chat!_\n_Send any image, video, or sticker and it will automatically be converted into an audio sticker._\n_Use \`\`\`${global.handlers[0]}audiofactory off\`\`\` to disable._`
    );
  }

  if (opt === 'off' || opt === 'disable' || (!opt && isEnabled)) {
    global.database.audioStickerChats = global.database.audioStickerChats.filter(x => x !== jid);
    return await sendFeedback(sock, msg, rawMessage, '_🔴 Audio Sticker Factory *DISABLED* in this chat._');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-FACTORY LISTENER (when audiofactory is enabled for the chat)
// ─────────────────────────────────────────────────────────────────────────────
addCommand({
  pattern: "onMessage",
  dontAddCommandList: true,
  access: "all"
}, async (msg, match, sock, rawMessage) => {
  if (msg.key.fromMe) return;
  const jid = msg.key.remoteJid;

  // Track recent visuals and audios for smart pairing across messages
  try {
    const incomingVis = extractVisualMedia(msg.message);
    if (incomingVis) {
      chatRecentVisuals.set(jid, { visual: incomingVis, ref: msg, time: Date.now() });
    }
    const incomingAud = extractAudioSource(msg.message);
    if (incomingAud) {
      chatRecentAudios.set(jid, { audioSource: incomingAud, ref: msg, time: Date.now() });
    }
  } catch {}

  if (!global.database.audioStickerChats?.includes(jid)) return;

  const msgId = msg.key.id;
  if (sentByBotIds.has(msgId)) return;

  const visual = extractVisualMedia(msg.message);
  if (!visual) return;

  // Skip if it's already a command
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';
  if (global.handlers.some(p => text.trimStart().startsWith(p))) return;

  try {
    const contextInfo = extractContextInfo(msg.message);
    const quoted = contextInfo?.quotedMessage ? {
      key: {
        remoteJid: jid,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      },
      message: unwrapMessage(contextInfo.quotedMessage)
    } : null;

    const quotedAudio = quoted ? extractAudioSource(quoted.message) : null;

    await processAndSendAudioSticker(sock, jid, { [visual.type]: visual.media }, msg, {
      mode: 'full',
      customAudioSource: quotedAudio,
      customAudioMsg: quoted
    });
  } catch (err) {
    console.error('[audiofactory auto] Error:', err.message);
  }
});
