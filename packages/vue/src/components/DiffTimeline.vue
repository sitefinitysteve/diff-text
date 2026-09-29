<template>
  <div
    class="text-diff-timeline"
    role="group"
    aria-label="Revision timeline"
  >
    <div
      v-if="model.steps.length === 0"
      class="diff-empty"
    >Nothing to compare</div>
    <template
      v-for="step in model.steps"
      :key="step.step"
    >
      <input
        :id="`${prefix}-rev-${step.step}`"
        class="diff-rev-input"
        type="radio"
        :name="`${prefix}-rev`"
        :checked.attr="checkedAttr(step.step)"
      >
      <label
        class="diff-rev-label"
        :for="`${prefix}-rev-${step.step}`"
      >{{ step.caption }}</label>
      <div
        class="diff-rev-panel"
        role="group"
        :aria-label="step.caption"
      >
        <div class="diff-rev-caption">{{ step.caption }}</div>
        <DiffStats
          :old-text="step.oldText"
          :new-text="step.newText"
          :mode="model.mode"
          :options="options"
        />
        <DiffUnified
          v-if="model.mode === 'unified'"
          :old-text="step.oldText"
          :new-text="step.newText"
          v-bind="lineProps"
          :anchors="anchors"
          :id-prefix="`${prefix}-rev-${step.step}`"
        />
        <DiffSplit
          v-else-if="model.mode === 'split'"
          :old-text="step.oldText"
          :new-text="step.newText"
          v-bind="lineProps"
          :anchors="anchors"
          :id-prefix="`${prefix}-rev-${step.step}`"
        />
        <component
          :is="TEXT_COMPONENTS[model.mode]"
          v-else
          :old-text="step.oldText"
          :new-text="step.newText"
          :options="options"
          :anchors="anchors"
          :id-prefix="`${prefix}-rev-${step.step}`"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// Revision timeline (SPEC section 22): one CSS-only tab (radio + label + panel) per consecutive pair of versions.
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { TextMode } from '@diff-text/core';
import { lineViewProps as splitLineProps, timelineModel } from '../model';
import type { TimelineMode, TimelineViewOptions } from '../model';
import { useIdPrefix } from '../useIdPrefix';
import DiffChars from './DiffChars.vue';
import DiffLines from './DiffLines.vue';
import DiffSentences from './DiffSentences.vue';
import DiffSplit from './DiffSplit.vue';
import DiffStats from './DiffStats.vue';
import DiffUnified from './DiffUnified.vue';
import DiffWords from './DiffWords.vue';
import DiffWordsWithSpace from './DiffWordsWithSpace.vue';

const TEXT_COMPONENTS: Record<TextMode, unknown> = {
  chars: DiffChars,
  words: DiffWords,
  wordsWithSpace: DiffWordsWithSpace,
  lines: DiffLines,
  sentences: DiffSentences,
};

const props = defineProps({
  /** The versions, oldest first. Each step diffs versions[K-1] → versions[K]. */
  versions: {
    type: Array as PropType<string[]>,
    required: true,
  },
  /** Version labels; missing entries default to "v1", "v2", ... */
  labels: {
    type: Array as PropType<string[]>,
    default: undefined,
  },
  /** A text mode, 'unified' or 'split'. Default 'words'. */
  mode: {
    type: String as PropType<TimelineMode>,
    default: 'words',
  },
  /** Options for every step's diff (text-mode options, or line-view options incl. contextLines and moves). */
  options: {
    type: Object as PropType<TimelineViewOptions>,
    default: () => ({}),
  },
  /** Put id="{idPrefix}-rev-K-change-N" on every change. Default false. */
  anchors: {
    type: Boolean,
    default: false,
  },
  /** Prefix for emitted ids (radios, and each panel's diff as "{idPrefix}-rev-K"). Default: unique per instance. */
  idPrefix: {
    type: String,
    default: undefined,
  },
});

const model = computed(() => timelineModel(props.versions, props.labels, props.mode));
const lineProps = computed(() => {
  const { contextLines, moves, options } = splitLineProps(props.options);
  return { contextLines, options, ...moves };
});
const prefix = useIdPrefix(() => props.idPrefix);

// Only the last step starts checked. Bound as an attribute (checked=""), not the DOM property,
// so client-rendered markup matches the server's and the radios stay uncontrolled.
const checkedAttr = (step: number) => (step === model.value.steps.length ? '' : undefined) as unknown as boolean | undefined;
</script>
