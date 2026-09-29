/**
 * Hydration over every fixture: server-render the component, hydrate the markup, and
 * require zero hydration errors. This catches server/client divergence that the
 * client-only fixture parity cannot see (e.g. CR in text, unstable default ids).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ComponentType, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
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

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const components: Record<MountKind, ComponentType<any>> = {
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

let errors: string[] = []
beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '))
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function hydrate(element: ReactElement): Promise<string[]> {
  const el = document.createElement('div')
  el.innerHTML = renderToString(element)
  document.body.appendChild(el)
  const recoverable: string[] = []
  let root: ReturnType<typeof hydrateRoot> | undefined
  await act(async () => {
    root = hydrateRoot(el, element, { onRecoverableError: (e) => recoverable.push(String(e)) })
  })
  act(() => root?.unmount())
  el.remove()
  return [...recoverable, ...errors]
}

describe('hydration', () => {
  for (const group of FIXTURE_GROUPS) {
    describe(group, () => {
      for (const f of loadFixtures(group)) {
        it(f.name, async () => {
          for (const c of mountCases(group, f)) {
            expect(await hydrate(createElement(components[c.kind], definedProps(c.props)))).toEqual([])
          }
        })
      }
    })
  }

  it('default ids (no idPrefix) hydrate without mismatch', async () => {
    const element = (
      <div>
        <DiffPlayback oldText="a" newText="b" anchors />
        <DiffTimeline versions={['a', 'b']} />
      </div>
    )
    expect(await hydrate(element)).toEqual([])
  })
})
