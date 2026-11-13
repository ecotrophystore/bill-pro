import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'electron', 'dist-server');
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.resolve(process.cwd(), 'server', 'whatsappService.ts')],
  outfile: path.join(outDir, 'whatsappService.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
  external: ['sharp', 'jimp', 'link-preview-js']
});

console.log('[build-server] Bundled server/whatsappService.ts -> electron/dist-server/whatsappService.cjs');

