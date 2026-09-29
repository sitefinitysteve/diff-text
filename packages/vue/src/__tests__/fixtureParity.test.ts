import { mount as vueMount } from '@vue/test-utils'
import type { Component } from 'vue'
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

function mount(kind: MountKind, props: MountProps): Mounted {
  const wrapper = vueMount(components[kind], { props: definedProps(props) })
  return { element: wrapper.element, unmount: () => wrapper.unmount() }
}

runFixtureParity(mount)
