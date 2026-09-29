// The shared diff-text demo page (demo/README.md), rendered with react-diff-text.
// content.json and demo.css are copied from ../../../demo by `npm run demo:sync`.
import { Fragment, useRef } from 'react'
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
} from 'react-diff-text'
import content from './content.json'

const COMPONENTS = {
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
const UNIFIED_STATS = { contextLines: 2 }

const USAGE = `import { DiffWords, DiffSplit, DiffStats } from 'react-diff-text'
import 'react-diff-text/dist/style.css'

<DiffWords oldText={before} newText={after} />
<DiffSplit oldText={before} newText={after} contextLines={3} />
<DiffStats oldText={before} newText={after} mode="unified" />`

export default function App() {
  // next() / prev() on the unified view scroll to and mark each change in turn.
  const unified = useRef(null)

  return (
    <div className="demo">
      <header className="demo-bar">
        <div className="demo-mark"><span className="del">diff</span><span className="add">text</span></div>
        <nav className="demo-platforms" aria-label="Platforms"><span>Vue</span><span aria-current="true">React</span><span>PHP</span></nav>
      </header>

      <section className="demo-hero">
        <div className="demo-hero-top">
          <h1>Show readers exactly what changed.</h1>
          <div>
            <p className="lede">Diff components for Vue, React, and PHP. Compare text by character, word, sentence, or line, or compare rich HTML without breaking its markup.</p>
            <code className="demo-install">npm i react-diff-text</code>
          </div>
        </div>
        <div className="grain">
          {grains.map((m) => (
            <Fragment key={m.key}>
              <input type="radio" name="grain" id={`g-${m.key}`} defaultChecked={m.key === 'words'} />
              <label htmlFor={`g-${m.key}`}>{m.title}</label>
            </Fragment>
          ))}
          <div className="stage">
            {grains.map((m) => {
              const Diff = COMPONENTS[m.key]
              return (
                <div key={m.key} className="stage-out" data-grain={m.key}>
                  <Diff oldText={hero.old} newText={hero.new} />
                  <div className="stage-meta">
                    <DiffStats oldText={hero.old} newText={hero.new} mode={m.key} />
                    <code>{tag(m.component)}</code>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="demo-section" id="granularity">
        <h2>Pick the right granularity</h2>
        <p>Each mode breaks the text into different pieces before comparing. Smaller pieces catch typos. Larger pieces keep rewrites readable.</p>
        <div className="specimens">
          {content.modes.map((m) => {
            const Diff = COMPONENTS[m.key]
            return (
              <article key={m.key} className="specimen">
                <header><h3>{m.title}</h3><code>{tag(m.component)}</code></header>
                <p className="use">{m.use}</p>
                <dl className="inputs">
                  <dt className="old">&minus;</dt><dd>{m.old}</dd>
                  <dt className="new">+</dt><dd>{m.new}</dd>
                </dl>
                <div className="result"><Diff oldText={m.old} newText={m.new} /></div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="demo-section" id="document">
        <h2>Review a whole document</h2>
        <p>For longer text, compare line by line. Unchanged stretches fold away, and edited lines show which words changed.</p>
        <div className="doc">
          <div className="doc-head"><h3>Side by side</h3><div className="doc-tags"><code>{tag('DiffSplit')}</code></div></div>
          <div className="doc-body"><DiffSplit oldText={doc.old} newText={doc.new} /></div>
        </div>
        <div className="doc">
          <div className="doc-head">
            <h3>Unified, with folded context</h3>
            <div className="doc-tags">
              <div className="doc-nav">
                <button type="button" onClick={() => unified.current?.prev()}>Previous change</button>
                <button type="button" onClick={() => unified.current?.next()}>Next change</button>
              </div>
              <DiffStats oldText={doc.old} newText={doc.new} mode="unified" options={UNIFIED_STATS} />
              <code>{tag('DiffUnified')}</code>
            </div>
          </div>
          <div className="doc-body"><DiffUnified ref={unified} oldText={doc.old} newText={doc.new} contextLines={2} /></div>
        </div>
      </section>

      <section className="demo-section" id="usage">
        <h2>Use it</h2>
        <pre className="usage"><span className="c">{'// npm i react-diff-text'}</span>{'\n' + USAGE}</pre>
      </section>

      <footer className="demo-foot">MIT licensed. Available as vue-diff-text, react-diff-text, and sitefinitysteve/php-diff-text.</footer>
    </div>
  )
}
