import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Writes the service worker with a fresh cache version on every build,
// so phones pick up new versions of the app automatically.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    writeBundle(options) {
      const src = fs.readFileSync(path.resolve('src/sw.js'), 'utf8');
      const version = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      fs.writeFileSync(path.join(options.dir, 'sw.js'), src.replace('__VERSION__', version));
      // Font data pdf.js needs for some bank statements.
      for (const dir of ['cmaps', 'standard_fonts']) {
        fs.cpSync(path.resolve('node_modules/pdfjs-dist', dir), path.join(options.dir, 'pdfjs', dir), { recursive: true });
      }
      // The PDF reader's worker, saved as .js so every host serves it as JavaScript.
      fs.copyFileSync(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'), path.join(options.dir, 'pdfjs', 'pdf.worker.min.js'));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
