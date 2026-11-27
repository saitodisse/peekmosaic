import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(root, 'packages/addon-chord-viewer/debug');
const publicPath = 'tab-renderer-debug';

export async function buildTabRendererDebug(outdir, dev = false) {
  const output = resolve(outdir, publicPath);
  await mkdir(output, { recursive: true });
  await copyFile(resolve(source, 'index.html'), resolve(output, 'index.html'));
  const options = {
    entryPoints: { debug: resolve(source, 'main.tsx') },
    outdir: output,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    target: 'es2022',
    minify: !dev,
    sourcemap: dev,
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  };
  if (!dev) {
    await build(options);
    return;
  }

  const server = await context(options);
  await server.watch();
  const { port } = await server.serve({ host: '0.0.0.0', port: 5310, servedir: outdir });
  console.log(`Tab Renderer debug: http://localhost:${port}/${publicPath}/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildTabRendererDebug(resolve(root, 'temp/tab-renderer-debug-dev'), true);
}
