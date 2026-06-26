// Generates Chrome extension icons as PNG files in public/
// Run: node scripts/generate-icons.mjs

import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public");

// Create an SVG icon: a stylized "WV" lettermark on a rounded square background
const sizes = [16, 48, 128];

const svgTemplate = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4f6cf7"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <text x="64" y="80" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="52" fill="white">WV</text>
</svg>
`;

async function generate() {
  for (const size of sizes) {
    const svg = svgTemplate(size);
    const pngBuffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    writeFileSync(resolve(outDir, `icon${size}.png`), pngBuffer);
    console.log(`Generated public/icon${size}.png`);
  }
  console.log("Done — all extension icons created.");
}

generate().catch(console.error);
