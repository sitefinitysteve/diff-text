<template>
  <div class="demo">
    <header class="demo-bar">
      <div class="demo-mark">
        <span class="del">diff</span><span class="add">text</span>
      </div>
      <nav
        class="demo-platforms"
        aria-label="Platforms"
      >
        <span aria-current="true">Vue</span><span>React</span><span>PHP</span>
      </nav>
    </header>

    <section class="demo-hero">
      <div class="demo-hero-top">
        <h1>Show readers exactly what changed.</h1>
        <div>
          <p class="lede">
            Diff components for Vue, React, and PHP. Compare text by character, word, sentence, or line, or compare rich HTML without breaking its markup.
          </p>
          <code class="demo-install">npm i vue-diff-text</code>
        </div>
      </div>
      <div class="grain">
        <template
          v-for="m in grains"
          :key="m.key"
        >
          <input
            :id="`g-${m.key}`"
            type="radio"
            name="grain"
            :checked="m.key === 'words'"
          ><label :for="`g-${m.key}`">{{ m.title }}</label>
        </template>
        <div class="stage">
          <div
            v-for="m in grains"
            :key="m.key"
            class="stage-out"
            :data-grain="m.key"
          >
            <component
              :is="components[m.key]"
              :old-text="hero.old"
              :new-text="hero.new"
            />
            <div class="stage-meta">
              <DiffStats
                :old-text="hero.old"
                :new-text="hero.new"
                :mode="m.key"
              /><code>{{ tag(m.component) }}</code>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      id="granularity"
      class="demo-section"
    >
      <h2>Pick the right granularity</h2>
      <p>Each mode breaks the text into different pieces before comparing. Smaller pieces catch typos. Larger pieces keep rewrites readable.</p>
      <div class="specimens">
        <article
          v-for="m in content.modes"
          :key="m.key"
          class="specimen"
        >
          <header>
            <h3>{{ m.title }}</h3><code>{{ tag(m.component) }}</code>
          </header>
          <p class="use">{{ m.use }}</p>
          <dl class="inputs">
            <dt class="old">&minus;</dt><dd>{{ m.old }}</dd><dt class="new">+</dt><dd>{{ m.new }}</dd>
          </dl>
          <div class="result">
            <component
              :is="components[m.key]"
              :old-text="m.old"
              :new-text="m.new"
            />
          </div>
        </article>
      </div>
    </section>

    <section
      id="document"
      class="demo-section"
    >
      <h2>Review a whole document</h2>
      <p>For longer text, compare line by line. Unchanged stretches fold away, and edited lines show which words changed.</p>
      <div class="doc">
        <div class="doc-head">
          <h3>Side by side</h3>
          <div class="doc-tags">
            <code>&lt;DiffSplit&gt;</code>
          </div>
        </div>
        <div class="doc-body">
          <DiffSplit
            :old-text="doc.old"
            :new-text="doc.new"
          />
        </div>
      </div>
      <div class="doc">
        <div class="doc-head">
          <h3>Unified, with folded context</h3>
          <div class="doc-tags">
            <div class="doc-nav">
              <button type="button" @click="unified?.prev()">Previous change</button><button type="button" @click="unified?.next()">Next change</button>
            </div>
            <DiffStats
              :old-text="doc.old"
              :new-text="doc.new"
              mode="unified"
              :options="{ contextLines: 2 }"
            /><code>&lt;DiffUnified&gt;</code>
          </div>
        </div>
        <div class="doc-body">
          <DiffUnified
            ref="unified"
            :old-text="doc.old"
            :new-text="doc.new"
            :context-lines="2"
          />
        </div>
      </div>
    </section>

    <section
      id="usage"
      class="demo-section"
    >
      <h2>Use it</h2>
      <pre class="usage"><span class="c">// npm i vue-diff-text</span>
{{ usage }}</pre>
    </section>

    <footer class="demo-foot">
      MIT licensed. Available as vue-diff-text, react-diff-text, and sitefinitysteve/php-diff-text.
    </footer>
  </div>
</template>

<script setup>
// The shared diff-text demo page (demo/README.md), rendered with vue-diff-text.
// content.json and demo.css are copied from ../../../demo by `npm run demo:sync`.
import { ref } from 'vue'
import {
  DiffChars,
  DiffWords,
  DiffWordsWithSpace,
  DiffSentences,
  DiffLines,
  DiffHtml,
  DiffSplit,
  DiffUnified,
  DiffStats,
} from 'vue-diff-text'
import content from './content.json'

const components = {
  chars: DiffChars,
  words: DiffWords,
  wordsWithSpace: DiffWordsWithSpace,
  sentences: DiffSentences,
  lines: DiffLines,
  html: DiffHtml,
}

const hero = content.hero
const doc = content.document
const grains = content.modes.filter((m) => m.key !== 'html')
const tag = (name) => `<${name}>`

// next() / prev() on the unified view scroll to and mark each change in turn.
const unified = ref(null)

const usage = `import { DiffWords, DiffSplit, DiffStats } from 'vue-diff-text'
import 'vue-diff-text/dist/style.css'

<DiffWords :old-text="before" :new-text="after" />
<DiffSplit :old-text="before" :new-text="after" :context-lines="3" />
<DiffStats :old-text="before" :new-text="after" mode="unified" />`
</script>
