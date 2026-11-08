import { build } from 'esbuild';
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', bundle: true, platform: 'node', format: 'esm' });
await build({
  entryPoints: ['src/client.ts'], outfile: 'dist/client.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', sourcemap: true,
  loader: { '.css': 'text' },
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-flex-layout", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
});
