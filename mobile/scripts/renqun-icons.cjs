// Renders the Renqun app icon, splash mark and Android icons from the same geometry as
// components/RenqunMark.tsx. Run after changing the mark:
//
//   npm run icons
//
// Uses `sharp` (a dev dependency). If ios/ exists (it is generated and git-ignored), the icon and
// splash there are refreshed too.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const INK = '#171717';
const RED = '#FF004D';
const SAND = '#F4F0ED';

// Keep in step with RenqunMark.tsx.
const VIEWBOX = '8 4 224 224';
const PATHS = ['M78 122L120 62L162 122', 'M20 206L62 146L104 206', 'M136 206L178 146L220 206'];
const HEAD = { cx: 120, cy: 29, r: 14 };
const STROKE = 22;

const markSvg = (ink, red) =>
  `<g stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" fill="none">${PATHS.map(
    (d) => `<path d="${d}"/>`,
  ).join('')}</g><circle cx="${HEAD.cx}" cy="${HEAD.cy}" r="${HEAD.r}" fill="${red}"/>`;

/** A square canvas with the mark at `scale` of the side, raised by `lift` (the mass sits low). */
function canvas(size, { bg = null, scale = 0.6, lift = 0.024, ink = INK, red = RED } = {}) {
  const m = size * scale;
  const x = (size - m) / 2;
  const y = (size - m) / 2 - size * lift;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '') +
      `<svg x="${x}" y="${y}" width="${m}" height="${m}" viewBox="${VIEWBOX}">${markSvg(ink, red)}</svg></svg>`,
  );
}

async function png(buf, out, { flatten = false } = {}) {
  let img = sharp(buf);
  if (flatten) img = img.flatten({ background: SAND }).removeAlpha();
  await img.png().toFile(out);
  console.log('wrote', path.relative(ROOT, out));
}

(async () => {
  const assets = path.join(ROOT, 'assets');
  // iOS icon: opaque, the system rounds the corners.
  await png(canvas(1024, { bg: SAND }), path.join(assets, 'icon.png'), { flatten: true });
  await png(canvas(48, { bg: SAND }), path.join(assets, 'favicon.png'), { flatten: true });
  // Native splash: the mark alone on a transparent field (app.json sets the sand background).
  await png(canvas(1024, { scale: 1, lift: 0 }), path.join(assets, 'splash-icon.png'));
  // Android adaptive icon: the mark inside the 66% safe zone, on a sand layer.
  await png(canvas(512, { scale: 0.42, lift: 0.015 }), path.join(assets, 'android-icon-foreground.png'));
  await png(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${SAND}"/></svg>`),
    path.join(assets, 'android-icon-background.png'),
  );
  await png(canvas(432, { scale: 0.42, lift: 0.015, ink: '#000000', red: '#000000' }), path.join(assets, 'android-icon-monochrome.png'));

  const ios = path.join(ROOT, 'ios');
  const project = fs.existsSync(ios) && fs.readdirSync(ios).find((d) => fs.existsSync(path.join(ios, d, 'Images.xcassets')));
  if (project) {
    const xc = path.join(ios, project, 'Images.xcassets');
    await png(canvas(1024, { bg: SAND }), path.join(xc, 'AppIcon.appiconset', 'App-Icon-1024x1024@1x.png'), { flatten: true });
    const splash = path.join(xc, 'SplashScreenLogo.imageset');
    for (const [file, px] of [['image.png', 172], ['image@2x.png', 344], ['image@3x.png', 516]]) {
      await png(canvas(px, { scale: 1, lift: 0 }), path.join(splash, file));
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
