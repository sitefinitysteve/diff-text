# diff-text demo template

All three platform demos (Vue, React, PHP) render the same page. This folder is the source for that
page. Each demo supplies its own markup; this folder supplies the look and the sample text.

| file | role |
|------|------|
| `demo.css` | Page chrome, plus the theme for the library markup. The same file is used by every platform. |
| `content.json` | All sample text: hero, one entry per mode, the document. `content.js` holds the same data as `window.DEMO_CONTENT`. |
| `prototype.html` | A client-side reference render (jsdiff from a CDN). Open it straight from disk. |

Platform demos:

- `packages/vue/demo` (`npm install && npm run dev`)
- `packages/react/demo` (`npm install && npm run dev`)
- `packages/php/demo/index.php` (run it with `composer demo`, or see the PHP README)

## Styling rules

- Load the library `style.css` first, then `demo.css`.
- `demo.css` styles the library markup only through the public `--text-diff-*` custom properties
  (SPEC.md section 14). It never targets `.text-diff*`, `.diff-row*`, `.diff-cell*`, `.diff-gutter`,
  `.diff-sign` or `.diff-stat*` with anything else. The one exception is type (font, size, leading)
  set on a demo wrapper such as `.stage`, `.result` or `.doc-body`, and on `.text-diff-stats`.
- Fonts: Bricolage Grotesque (display), Hanken Grotesk (body), Martian Mono (code and diffs). They
  load from Google Fonts through `@import` at the top of `demo.css`.
- Palette: cool paper. `--marker` (blue) is used only for focus rings. No gradients and no
  left-border callout boxes.
- Dark mode follows `prefers-color-scheme`, and `data-theme="light|dark"` on `<html>` overrides it.

## Page contract

Emit these elements in this order. Keep the class names and ids exactly, because `demo.css` and the
CSS-only switch depend on them. Items in CAPS are platform-specific. "LIB" means the library's own
output, unchanged (SPEC.md section 13).

```html
<div class="demo">

  <!-- 1. Top bar -->
  <header class="demo-bar">
    <div class="demo-mark"><span class="del">diff</span><span class="add">text</span></div>
    <nav class="demo-platforms" aria-label="Platforms">
      <span>Vue</span><span>React</span><span aria-current="true">PHP</span>  <!-- current platform -->
    </nav>
  </header>

  <!-- 2. Hero -->
  <section class="demo-hero">
    <div class="demo-hero-top">
      <h1>Show readers exactly what changed.</h1>
      <div>
        <p class="lede">...</p>
        <code class="demo-install">INSTALL COMMAND</code>
      </div>
    </div>
    <div class="grain">
      <!-- one radio + label per text mode, in content order; "words" is checked -->
      <input type="radio" name="grain" id="g-chars"><label for="g-chars">Characters</label>
      <input type="radio" name="grain" id="g-words" checked><label for="g-words">Words</label>
      <input type="radio" name="grain" id="g-wordsWithSpace">...
      <input type="radio" name="grain" id="g-sentences">...
      <input type="radio" name="grain" id="g-lines">...
      <div class="stage">
        <!-- one output per mode; CSS shows the one whose radio is checked -->
        <div class="stage-out" data-grain="chars">
          LIB text diff of content.hero (mode chars)
          <div class="stage-meta">LIB stats badge (mode chars)<code>API NAME</code></div>
        </div>
        ...
      </div>
    </div>
  </section>

  <!-- 3. Specimens: one tile per entry in content.modes (6, including html) -->
  <section class="demo-section" id="granularity">
    <h2>Pick the right granularity</h2>
    <p>...</p>
    <div class="specimens">
      <article class="specimen">
        <header><h3>TITLE</h3><code>API NAME</code></header>
        <p class="use">USE</p>
        <dl class="inputs"><dt class="old">−</dt><dd>OLD (escaped)</dd><dt class="new">+</dt><dd>NEW (escaped)</dd></dl>
        <div class="result">LIB text or HTML diff of OLD / NEW</div>
      </article>
      ...
    </div>
  </section>

  <!-- 4. Document views, from content.document -->
  <section class="demo-section" id="document">
    <h2>Review a whole document</h2>
    <p>...</p>
    <div class="doc">
      <div class="doc-head"><h3>Side by side</h3><div class="doc-tags"><code>API NAME</code></div></div>
      <div class="doc-body">LIB split view (default contextLines)</div>
    </div>
    <div class="doc">
      <div class="doc-head"><h3>Unified, with folded context</h3>
        <div class="doc-tags">
          <!-- Vue and React only: calls prev() / next() on the unified view -->
          <div class="doc-nav"><button type="button">Previous change</button><button type="button">Next change</button></div>
          LIB stats badge (mode unified)<code>API NAME</code></div></div>
      <div class="doc-body">LIB unified view, contextLines 2</div>
    </div>
  </section>

  <!-- 5. Usage -->
  <section class="demo-section" id="usage">
    <h2>Use it</h2>
    <pre class="usage"><span class="c">COMMENT</span>
PLATFORM CODE (escaped)</pre>
  </section>

  <!-- 6. Footer -->
  <footer class="demo-foot">MIT licensed. Available as vue-diff-text, react-diff-text, and sitefinitysteve/php-diff-text.</footer>
</div>
```

Per platform:

| slot | Vue | React | PHP |
|------|-----|-------|-----|
| current pill | Vue | React | PHP |
| INSTALL COMMAND | `npm i vue-diff-text` | `npm i react-diff-text` | `composer require sitefinitysteve/php-diff-text` |
| API NAME | `<DiffWords>` (`content.modes[].component`) | same as Vue | `DiffText::words()` (`content.modes[].php` + `()`) |
| collapsed rows | may be `<button>`s that expand | same as Vue | static `div`s |
| `.doc-nav` buttons | yes, wired to the unified view's `prev()` / `next()` | same as Vue (a `ref` on `DiffUnified`) | omitted |

Notes:

- The granularity switch needs no JavaScript. The ids `g-chars`, `g-words`, `g-wordsWithSpace`,
  `g-sentences` and `g-lines` are hard-coded in `demo.css`. The radios, the labels and `.stage` must
  be siblings inside `.grain`.
- The HTML specimen runs the real HTML diff, so inline formatting tags (`<strong>` and the like) are
  stripped from the result, as SPEC.md section 12 describes.
- The text in `content.json` is shared. Change it there, then run each platform's sync step (PHP:
  `composer demo:sync`; Vue and React: `npm run demo:sync`, which also runs before `dev` and
  `build`), and keep `content.js` in step with it.
