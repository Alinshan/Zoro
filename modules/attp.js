const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const sharp = require('sharp');

let ffmpegPath;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  ffmpegPath = 'ffmpeg';
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Wrap long text into multiple lines
function wrapText(text, maxCharsPerLine = 9) {
  const words = text.split(/\s+/);
  const lines = [];
  for (const word of words) {
    let w = word;
    // Break single words that are too long
    while (w.length > maxCharsPerLine) {
      lines.push(w.substring(0, maxCharsPerLine));
      w = w.substring(maxCharsPerLine);
    }
    if (w.length === 0) continue;
    if (lines.length > 0 && (lines[lines.length - 1] + ' ' + w).length <= maxCharsPerLine) {
      lines[lines.length - 1] += ' ' + w;
    } else {
      lines.push(w);
    }
  }
  return lines.length > 0 ? lines : [text];
}

// Convert hsl to hex so librsvg handles colour correctly
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

addCommand(
  { pattern: '^attp ?(.*)', access: 'all', desc: '_Animated Text To Sticker._', pluginVersion: '1.0.1', pluginId: 'attp' },
  async (msg, match, sock, rawMessage) => {
    if (!match[1] || !match[1].trim()) {
      return await sock.sendMessage(
        msg.key.remoteJid,
        { text: '_❌ Please provide text.  Example: .attp Hello_' },
        { quoted: rawMessage.messages[0] }
      );
    }

    const dKey = await sock.sendMessage(
      msg.key.remoteJid,
      { text: '_⏳ Generating animated sticker…_' },
      { quoted: rawMessage.messages[0] }
    );

    const randId = Math.floor(Math.random() * 1e7);
    const tempFiles = [];
    const stickerPath = path.join(__dirname, '..', 'src', `attp_${randId}.webp`);

    try {
      const text = match[1].trim();
      const lines = wrapText(text, 9);

      // ── Font-size: fill 85 % of canvas width ──────────────────────────────
      const CANVAS = 512;
      const maxLen  = Math.max(...lines.map(l => l.length));

      // Approximate px-per-char for a bold sans-serif font ≈ 0.65 × fontSize
      // Using 0.65 prevents wide chars (m, w, M, W) from clipping at canvas edges
      let fontSize = Math.floor((CANVAS * 0.85) / (maxLen * 0.65));

      // Clamp vertically so lines don't overflow
      const maxByHeight = Math.floor((CANVAS * 0.85) / (lines.length * 1.25));
      if (fontSize > maxByHeight) fontSize = maxByHeight;

      // Hard limits
      if (fontSize < 48)  fontSize = 48;
      if (fontSize > 200) fontSize = 200;

      const strokeW  = Math.max(4, Math.round(fontSize * 0.12));
      const lineH    = Math.round(fontSize * 1.25);
      const totalH   = lineH * lines.length;
      const startY   = Math.round((CANVAS - totalH) / 2 + lineH * 0.82); // baseline of first line

      const NUM_FRAMES = 12;

      for (let i = 0; i < NUM_FRAMES; i++) {
        // Rainbow: cycle hue across frames
        const hue  = Math.round((i / NUM_FRAMES) * 360);
        const fill = hslToHex(hue, 100, 50);

        // Build one <text> per line using INLINE SVG ATTRIBUTES
        // (librsvg on Windows ignores <style> blocks for font-size)
        const textNodes = lines.map((line, idx) => {
          const y = startY + idx * lineH;
          return [
            `<text`,
            `  x="${CANVAS / 2}"`,
            `  y="${y}"`,
            `  text-anchor="middle"`,
            `  font-family="Arial Black, Arial, sans-serif"`,
            `  font-weight="900"`,
            `  font-size="${fontSize}"`,
            `  fill="${fill}"`,
            `  stroke="#000000"`,
            `  stroke-width="${strokeW}"`,
            `  stroke-linejoin="round"`,
            `  paint-order="stroke fill"`,
            `>${escapeXml(line)}</text>`,
          ].join(' ');
        }).join('\n');

        // No background rect → fully transparent sticker
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${CANVAS}" height="${CANVAS}"
     viewBox="0 0 ${CANVAS} ${CANVAS}">
${textNodes}
</svg>`;

        const pngPath = path.join(__dirname, '..', 'src', `frame_${randId}_${i}.png`);
        await sharp(Buffer.from(svg)).png().toFile(pngPath);
        tempFiles.push(pngPath);
      }

      // Compile frames → animated WebP with full transparency (bgra)
      const inputPat = path.join(__dirname, '..', 'src', `frame_${randId}_%d.png`);
      const cmd = `"${ffmpegPath}" -y -framerate 10 -i "${inputPat}" -vcodec libwebp -loop 0 -pix_fmt bgra -s ${CANVAS}x${CANVAS} "${stickerPath}"`;
      execSync(cmd, { stdio: 'ignore' });
      await global.addExif(stickerPath, "© ᴢᴏʀᴏ ʙᴏᴛ", "© ᴢᴏʀᴏ ʙᴏᴛ");



      // Send animated sticker
      await sock.sendMessage(
        msg.key.remoteJid,
        { sticker: { url: stickerPath, isAnimated: true } },
        { quoted: rawMessage.messages[0] }
      );

    } catch (err) {
      console.error('[attp] Error:', err.message);

      await sock.sendMessage(
        msg.key.remoteJid,
        { text: '❌ _Sticker generation failed. Please try again._' },
        { quoted: rawMessage.messages[0] }
      );
    } finally {
      tempFiles.forEach(f => { try { fs.unlinkSync(f); } catch {} });
      try { fs.unlinkSync(stickerPath); } catch {}
    }
  }
);