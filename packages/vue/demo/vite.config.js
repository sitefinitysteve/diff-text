import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      // Point straight at the library source so edits hot-reload without a build.
      'vue-diff-text': resolve(__dirname, '../src/index.ts'),
    },
    // The library source imports vue from the monorepo; use the demo's single copy.
    dedupe: ['vue'],
  },
})
