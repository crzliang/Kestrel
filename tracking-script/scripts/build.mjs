import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outfile = join(root, 'dist', 'kestrel.js');
const version = process.env.KESTREL_VERSION || '0.1.0';
const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [join(root, 'src/index.ts')],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2018'],
  legalComments: 'none',
  define: {
    __KESTREL_VERSION__: JSON.stringify(version),
  },
};

mkdirSync(join(root, 'dist'), { recursive: true });

function reportSize() {
  const raw = readFileSync(outfile);
  const gzip = gzipSync(raw);
  const line = `kestrel.js  raw=${raw.length}B  gzip=${gzip.length}B  version=${version}\n`;
  writeFileSync(join(root, 'dist', 'SIZE.txt'), line);
  console.log(line.trim());
  if (gzip.length > 5 * 1024) {
    console.warn('Warning: gzip size exceeds 5KB budget');
  }
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('watching tracking-script…');
} else {
  await esbuild.build(buildOptions);
  // also emit versioned copy for immutable CDN path
  const versioned = join(root, 'dist', 'k', version, 'kestrel.js');
  mkdirSync(dirname(versioned), { recursive: true });
  writeFileSync(versioned, readFileSync(outfile));
  reportSize();
}
