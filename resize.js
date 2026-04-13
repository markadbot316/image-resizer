#!/usr/bin/env node

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ─── Help Text ───────────────────────────────────────────────────────────────
const HELP = `
Image Resizer CLI
─────────────────
Usage:
  node resize.js <input> [options]

Options:
  -w, --width <px>       Target width in pixels
  -h, --height <px>      Target height in pixels
  -o, --output <file>    Output file path (default: <name>-resized.<ext>)
  -q, --quality <1-100>  JPEG/WebP quality (default: 80)
  -f, --format <fmt>     Output format: jpeg, png, webp, avif (default: same as input)
  --fit <mode>           Resize fit: cover, contain, fill, inside, outside (default: inside)
  --no-enlarge           Do not enlarge image if smaller than target
  --info                 Show image info without resizing
  --help                 Show this help

Examples:
  node resize.js photo.jpg -w 800
  node resize.js photo.jpg -w 1920 -h 1080 --fit cover
  node resize.js photo.png -w 500 -f webp -q 90 -o thumb.webp
  node resize.js photo.jpg --info
`;

// ─── Argument Parser ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    width: null,
    height: null,
    output: null,
    quality: 80,
    format: null,
    fit: 'inside',
    noEnlarge: false,
    info: false,
    input: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help': console.log(HELP); process.exit(0); break;
      case '-w': case '--width':    opts.width = parseInt(args[++i]); break;
      case '-h': case '--height':   opts.height = parseInt(args[++i]); break;
      case '-o': case '--output':   opts.output = args[++i]; break;
      case '-q': case '--quality':  opts.quality = parseInt(args[++i]); break;
      case '-f': case '--format':   opts.format = args[++i]; break;
      case '--fit':                 opts.fit = args[++i]; break;
      case '--no-enlarge':          opts.noEnlarge = true; break;
      case '--info':                opts.info = true; break;
      default:
        if (!arg.startsWith('-')) opts.input = arg;
        else { console.error(`Unknown option: ${arg}`); process.exit(1); }
    }
  }
  return opts;
}

// ─── Format Output Path ───────────────────────────────────────────────────────
function buildOutputPath(input, format) {
  const ext = format || path.extname(input).slice(1) || 'jpg';
  const base = path.basename(input, path.extname(input));
  const dir = path.dirname(input);
  return path.join(dir, `${base}-resized.${ext}`);
}

// ─── Format bytes ─────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.input) {
    console.error('Error: No input file specified.\n');
    console.log(HELP);
    process.exit(1);
  }

  if (!fs.existsSync(opts.input)) {
    console.error(`Error: File not found: ${opts.input}`);
    process.exit(1);
  }

  const image = sharp(opts.input);
  const meta = await image.metadata();

  // ── Info mode ──────────────────────────────────────────────────────────────
  if (opts.info) {
    const stat = fs.statSync(opts.input);
    console.log(`\nImage Info: ${opts.input}`);
    console.log('─'.repeat(40));
    console.log(`  Format    : ${meta.format}`);
    console.log(`  Width     : ${meta.width}px`);
    console.log(`  Height    : ${meta.height}px`);
    console.log(`  Channels  : ${meta.channels}`);
    console.log(`  Size      : ${formatBytes(stat.size)}`);
    console.log(`  Has Alpha : ${meta.hasAlpha}`);
    console.log('');
    return;
  }

  // ── Validate resize options ────────────────────────────────────────────────
  if (!opts.width && !opts.height) {
    console.error('Error: Specify at least --width or --height.');
    process.exit(1);
  }

  const validFits = ['cover', 'contain', 'fill', 'inside', 'outside'];
  if (!validFits.includes(opts.fit)) {
    console.error(`Error: Invalid --fit value. Choose from: ${validFits.join(', ')}`);
    process.exit(1);
  }

  // ── Build resize options ───────────────────────────────────────────────────
  const resizeOpts = {
    width: opts.width || undefined,
    height: opts.height || undefined,
    fit: opts.fit,
    withoutEnlargement: opts.noEnlarge,
  };

  // ── Determine output format ────────────────────────────────────────────────
  const outputFormat = opts.format || meta.format;
  const outputPath = opts.output || buildOutputPath(opts.input, outputFormat);

  const formatOpts = { quality: opts.quality };

  // ── Process ────────────────────────────────────────────────────────────────
  console.log(`\nResizing: ${opts.input}`);
  console.log(`  Original  : ${meta.width} x ${meta.height}px (${meta.format})`);

  let pipeline = image.resize(resizeOpts);

  switch (outputFormat) {
    case 'jpeg': case 'jpg': pipeline = pipeline.jpeg(formatOpts); break;
    case 'png':              pipeline = pipeline.png(); break;
    case 'webp':             pipeline = pipeline.webp(formatOpts); break;
    case 'avif':             pipeline = pipeline.avif(formatOpts); break;
    default:                 pipeline = pipeline.toFormat(outputFormat, formatOpts);
  }

  const info = await pipeline.toFile(outputPath);
  const inStat  = fs.statSync(opts.input);
  const outStat = fs.statSync(outputPath);

  console.log(`  Resized   : ${info.width} x ${info.height}px (${info.format})`);
  console.log(`  Output    : ${outputPath}`);
  console.log(`  Size      : ${formatBytes(inStat.size)} → ${formatBytes(outStat.size)}`);
  console.log(`  Done!\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
