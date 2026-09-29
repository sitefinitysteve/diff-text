# vue-diff-text demo

The shared diff-text demo page (see `../../../demo/README.md`), rendered with the real
vue-diff-text components. Vite aliases `vue-diff-text` to `../src`, so library edits show up
without a build.

```sh
npm install          # also run `npm install` once at the monorepo root
npm run dev          # http://localhost:5174
npm run build && npm run preview
```

`npm run demo:sync` copies `demo.css` and `content.json` from the monorepo's `demo/` folder into
`src/`. It runs automatically before `dev` and `build`.
