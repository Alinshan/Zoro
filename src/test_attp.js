const sharp = require('sharp');
const path = require('path');

const fontSize = 180;
const strokeW = Math.round(fontSize * 0.12);
const CANVAS = 512;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <text x="${CANVAS/2}" y="320"
    text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    fill="#ff0055"
    stroke="#000000"
    stroke-width="${strokeW}"
    stroke-linejoin="round"
    paint-order="stroke fill">meow</text>
</svg>`;

const out = path.join(__dirname, 'test_attp_out.png');

sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then(info => {
    console.log('✅ SUCCESS! Rendered PNG:', info.width + 'x' + info.height, '@ ' + info.size + ' bytes');
    console.log('File saved to:', out);
  })
  .catch(err => {
    console.error('❌ FAILED:', err.message);
  });
