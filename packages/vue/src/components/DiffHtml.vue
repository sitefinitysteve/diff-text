<template>
  <div class="text-diff text-diff-html">
    <template v-if="isFullReplacement">
      <span
        class="diff-removed"
        v-html="oldText"
      />
      <span
        class="diff-added"
        v-html="newText"
      />
    </template>
    <div
      v-else
      v-html="diffResult"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { diff } from 'diffblazer';
import { computeTextSimilarity } from '../utils/similarity';
import { normalizeQuotes, stripFormattingTags } from '../utils/normalizeHtml';

const props = defineProps({
  oldText: {
    type: String,
    required: true,
  },
  newText: {
    type: String,
    required: true,
  },
  options: {
    type: Object,
    default: () => ({}),
  },
  similarityThreshold: {
    type: Number,
    default: null,
  },
  ignoreFormattingTags: {
    type: Boolean,
    default: true,
  },
});

/**
 * Normalize both inputs: always normalize quotes,
 * and optionally strip inline formatting tags.
 */
function normalizeInput(text: string): string {
  let result = normalizeQuotes(text);
  if (props.ignoreFormattingTags) {
    result = stripFormattingTags(result);
  }
  return result;
}

const isFullReplacement = computed<boolean>(() => {
  if (props.similarityThreshold === null) return false;
  if (!props.oldText || !props.newText) return false;

  const similarity = computeTextSimilarity(props.oldText, props.newText);
  return similarity < props.similarityThreshold;
});

const diffResult = computed<string>(() => {
  // Merge user options with custom markers to match other diff components
  const customOptions = {
    orphanMatchThreshold: 0.3,
    markers: {
      insert: {
        start: '<span class="diff-added">',
        end: '</span>',
      },
      delete: {
        start: '<span class="diff-removed">',
        end: '</span>',
      },
      modify: {
        start: '<span class="diff-added">',
        end: '</span>',
      },
      replaceDelete: {
        start: '<span class="diff-removed">',
        end: '</span>',
      },
      replaceInsert: {
        start: '<span class="diff-added">',
        end: '</span>',
      },
    },
    ...props.options
  };

  return diff(normalizeInput(props.oldText), normalizeInput(props.newText), customOptions);
});
</script>
