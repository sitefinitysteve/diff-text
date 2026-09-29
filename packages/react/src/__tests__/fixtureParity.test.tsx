import { createElement, type ComponentType } from 'react'
import { render } from '@testing-library/react'
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
import { definedProps, runFixtureParity } from './fixtureParity'
import type { MountKind, MountProps, Mounted } from './fixtureParity'

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

function mount(kind: MountKind, props: MountProps): Mounted {
  const { container, unmount } = render(createElement(components[kind], definedProps(props)))
  return { element: container.firstElementChild as Element, unmount }
}

runFixtureParity(mount)
