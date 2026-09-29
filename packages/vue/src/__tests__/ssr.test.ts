// @vitest-environment node
/**
 * Server rendering runs without DOM globals. The hydration suite (jsdom) cannot catch a
 * component that touches document/window during setup or render, so this one runs in node.
 */
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import type { Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import {
  DiffChars,
  DiffHeatmap,
  DiffHtml,
  DiffLines,
  DiffPlayback,
  DiffSentences,
  DiffSplit,
  DiffStats,
  DiffTimeline,
  DiffUnified,
  DiffWords,
  DiffWordsWithSpace,
} from '../index'

const LONG = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
const MOVED_OLD = 'a\nb\nc\nd\ne\n'
const MOVED_NEW = 'c\nd\ne\na\nb\n'

// [name, component, props, fragments the markup must contain]
const CASES: Array<[string, Component, Record<string, unknown>, string[]]> = [
  ['DiffChars', DiffChars, { oldText: 'cat', newText: 'car' }, ['class="text-diff text-diff-chars"', 'data-change-index="1"']],
  ['DiffWords', DiffWords, { oldText: 'a b', newText: 'a c', anchors: true, idPrefix: 'w' }, ['id="w-change-0"']],
  ['DiffWordsWithSpace', DiffWordsWithSpace, { oldText: 'a b', newText: 'a  c' }, ['text-diff-words-with-space']],
  ['DiffLines', DiffLines, { oldText: 'a\nb', newText: 'a\nc', minimap: true, idPrefix: 'l' }, ['text-diff-with-minimap', 'href="#l-change-0"']],
  ['DiffSentences', DiffSentences, { oldText: 'A. B.', newText: 'A. C.' }, ['text-diff-sentences']],
  ['DiffHtml', DiffHtml, { oldText: '<p>a <b>b</b></p>', newText: '<p>a c</p>' }, ['text-diff-html', 'diff-added']],
  ['DiffUnified', DiffUnified, { oldText: LONG, newText: LONG.replace('line 10', 'X') }, ['diff-row-collapsed', 'diff-row-added']],
  ['DiffSplit', DiffSplit, { oldText: MOVED_OLD, newText: MOVED_NEW, detectMoves: true, idPrefix: 's' }, ['diff-row-moved-from', 'id="s-move-0-from"']],
  ['DiffStats', DiffStats, { oldText: 'a', newText: 'b' }, ['text-diff-stats', '% similar']],
  ['DiffHeatmap', DiffHeatmap, { oldText: 'The cat sat. It was warm.', newText: 'The cat sat down.' }, ['text-diff-heatmap', 'diff-heat-legend']],
  ['DiffTimeline', DiffTimeline, { versions: ['a', 'b', 'c'], mode: 'unified' }, ['text-diff-timeline', 'checked', 'text-diff-unified']],
  ['DiffPlayback', DiffPlayback, { oldText: 'a b', newText: 'a c', speed: 200 }, ['--text-diff-playback-step:200ms', '--td-i:1']],
]

describe('SSR in node', () => {
  it('has no DOM globals', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
  })

  for (const [name, component, props, fragments] of CASES) {
    it(`renders ${name}`, async () => {
      const html = await renderToString(createSSRApp({ render: () => h(component, props) }))
      for (const fragment of fragments) expect(html).toContain(fragment)
    })
  }
})
