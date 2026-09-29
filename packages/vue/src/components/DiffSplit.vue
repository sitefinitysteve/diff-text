<template>
  <MinimapFrame
    :enabled="minimap"
    :links="links"
  >
    <div
      ref="root"
      class="text-diff text-diff-split"
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
            :data-move="rowMove(item.row)"
            :data-change-index="item.changeIndex ?? undefined"
          >
            <template
              v-for="side in sidesOf(item.row)"
              :key="side.side"
            >
              <div
                v-if="!side.cell"
                :class="cellClass(side.side, side.cell)"
              />
              <div
                v-else
                :class="cellClass(side.side, side.cell)"
                :role="side.cell.type === 'equal' ? undefined : 'group'"
                :aria-label="cellAriaLabel(side.cell)"
              >
                <span class="diff-gutter">{{ side.cell.lineNo }}</span>
                <span
                  class="diff-sign"
                  aria-hidden="true"
                >{{ signFor(side.cell.type) }}</span>
                <span
                  v-if="side.cell.parts"
                  class="diff-line"
                >
                  <template
                    v-for="(part, index) in nonEmptyParts(side.cell.parts)"
                    :key="index"
                  >
                    <span v-if="partKind(part) === 'equal'">{{ part.value }}</span>
                    <span
                      v-else
                      :class="`diff-${partKind(part)}`"
                    >{{ part.value }}</span>
                  </template>
                </span>
                <span
                  v-else
                  class="diff-line"
                >{{ side.cell.text }}</span>
                <a
                  v-if="linkOf(side.cell, item)"
                  :id="linkOf(side.cell, item)!.id"
                  class="diff-move-link"
                  :href="linkOf(side.cell, item)!.href"
                >{{ linkOf(side.cell, item)!.text }}</a>
              </div>
            </template>
          </div>
        </template>
      </template>
    </div>
  </MinimapFrame>
</template>

<script setup lang="ts">
// Side-by-side line view with intra-line word highlights, expandable "N unchanged lines" rows and optional moved blocks.
import { collapsedLabel } from '@diff-text/core';
import type { SplitCell, SplitRow } from '@diff-text/core';
import { cellAriaLabel, cellClass, nonEmptyParts, partKind, rowClass, rowMove, signFor } from '../model';
import MinimapFrame from './MinimapFrame';
import { lineViewProps, useLineView } from './lineView';

const props = defineProps(lineViewProps);
const { root, model, items, expand, links, idOf, linkOf, exposed } = useLineView<SplitRow>('split', props);

function sidesOf(row: SplitRow): Array<{ side: 'old' | 'new'; cell: SplitCell | undefined }> {
  return [
    { side: 'old', cell: row.left },
    { side: 'new', cell: row.right },
  ];
}

defineExpose(exposed);
</script>
