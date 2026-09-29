<template>
  <MinimapFrame
    :enabled="minimap"
    :links="links"
  >
    <div
      ref="root"
      class="text-diff text-diff-unified"
    >
      <div
        v-if="!model.hasChanges"
        class="diff-empty"
      >No changes</div>
      <template v-else>
        <template
          v-for="item in items"
          :key="item.key"
        >
          <button
            v-if="item.kind === 'collapsed'"
            type="button"
            class="diff-row diff-row-collapsed"
            @click="expand(item.block)"
          >{{ collapsedLabel(item.count) }}</button>
          <div
            v-else
            :id="idOf(item.changeIndex)"
            :class="rowClass(item.row)"
            :role="item.row.type === 'equal' ? undefined : 'group'"
            :aria-label="unifiedAriaLabel(item.row)"
            :data-move="rowMove(item.row)"
            :data-change-index="item.changeIndex ?? undefined"
          >
            <span class="diff-gutter diff-gutter-old">{{ item.row.oldNo ?? '' }}</span>
            <span class="diff-gutter diff-gutter-new">{{ item.row.newNo ?? '' }}</span>
            <span
              class="diff-sign"
              aria-hidden="true"
            >{{ signFor(item.row.type) }}</span>
            <span class="diff-line">{{ item.row.text }}</span>
            <a
              v-if="linkOf(item.row, item)"
              :id="linkOf(item.row, item)!.id"
              class="diff-move-link"
              :href="linkOf(item.row, item)!.href"
            >{{ linkOf(item.row, item)!.text }}</a>
          </div>
        </template>
      </template>
    </div>
  </MinimapFrame>
</template>

<script setup lang="ts">
// Unified line view with old/new gutters, expandable "N unchanged lines" rows and optional moved blocks.
import { collapsedLabel } from '@diff-text/core';
import type { LineRow } from '@diff-text/core';
import { rowClass, rowMove, signFor, unifiedAriaLabel } from '../model';
import MinimapFrame from './MinimapFrame';
import { lineViewProps, useLineView } from './lineView';

const props = defineProps(lineViewProps);
const { root, model, items, expand, links, idOf, linkOf, exposed } = useLineView<LineRow>('unified', props);

defineExpose(exposed);
</script>
