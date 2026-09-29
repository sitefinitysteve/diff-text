/**
 * Hydration over every fixture: server-render the component, hydrate the markup, and
 * require zero hydration warnings. This catches server/client divergence that the
 * client-only fixture parity cannot see (e.g. CR in text, attribute-vs-property booleans,
 * unstable default ids).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { FIXTURE_GROUPS, definedProps, loadFixtures, mountCases } from './fixtureParity'
import type { MountKind } from './fixtureParity'

const components: Record<MountKind, Component> = {
  chars: DiffChars,
  words: DiffWords,
  wordsWithSpace: DiffWordsWithSpace,
  lines: DiffLines,
  sentences: DiffSentences,
  html: DiffHtml,
  split: DiffSplit,
  unified: DiffUnified,
  stats: DiffStats,
  heatmap: DiffHeatmap,
  timeline: DiffTimeline,
  playback: DiffPlayback,
}

let messages: string[] = []
beforeEach(() => {
  messages = []
  const collect = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '))
  }
  vi.spyOn(console, 'warn').mockImplementation(collect)
  vi.spyOn(console, 'error').mockImplementation(collect)
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function hydrate(component: Component, props: Record<string, unknown>): Promise<string[]> {
  const app = () => createSSRApp({ render: () => h(component, props) })
  const el = document.createElement('div')
  el.innerHTML = await renderToString(app())
  document.body.appendChild(el)
  app().mount(el)
  el.remove()
  return messages.filter((m) => /hydration/i.test(m))
}

describe('hydration', () => {
  for (const group of FIXTURE_GROUPS) {
    describe(group, () => {
      for (const f of loadFixtures(group)) {
        it(f.name, async () => {
          for (const c of mountCases(group, f)) {
            expect(await hydrate(components[c.kind], definedProps(c.props))).toEqual([])
          }
        })
      }
    })
  }

  it('default ids (no idPrefix) hydrate without mismatch', async () => {
    const wrapper = { render: () => [h(DiffPlayback, { oldText: 'a', newText: 'b', anchors: true }), h(DiffTimeline, { versions: ['a', 'b'] })] }
    expect(await hydrate(wrapper, {})).toEqual([])
  })
})
