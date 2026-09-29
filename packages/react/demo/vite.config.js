import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs: the build is deployed under /diff-text/<platform>/ on GitHub Pages.
  base: './',
  plugins: [react()],
  server: {
    port: 5175,
  },
  resolve: {
    alias: {
      // Point straight at the library source so edits hot-reload without a build.
      // The canonical stylesheet (the build ships a copy as dist/style.css).
      'react-diff-text/dist/style.css': resolve(__dirname, '../../core/src/style.css'),
      'react-diff-text': resolve(__dirname, '../src/index.ts'),
    },
    // The library source imports react from the monorepo; use the demo's single copy.
    dedupe: ['react', 'react-dom'],
  },
})
