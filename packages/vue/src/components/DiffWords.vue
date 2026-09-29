<template>
  <MinimapFrame
    :enabled="minimap"
    :links="links"
  >
    <div
      ref="root"
      class="text-diff text-diff-words"
    >
      <template
        v-for="(part, index) in model.parts"
        :key="index"
      >
        <span v-if="part.changeIndex === null">{{ part.value }}</span>
        <span
          v-else
          :id="idOf(part.changeIndex)"
          :class="`diff-${part.kind}`"
          :data-change-index="part.changeIndex"
        >{{ part.value }}</span>
      </template>
    </div>
  </MinimapFrame>
</template>

<script setup lang="ts">
// `words` diff. Options: ignoreCase, maxEditLength.
import MinimapFrame from './MinimapFrame';
import { textDiffProps, useTextDiff } from './textDiff';

const props = defineProps(textDiffProps);
const { root, model, links, idOf, exposed } = useTextDiff('words', props);

defineExpose(exposed);
</script>
