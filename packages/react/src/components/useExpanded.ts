import { useState } from 'react';
import { useContentVersion } from '../useContentVersion';

const NONE: ReadonlySet<number> = new Set();

/**
 * Which collapsed blocks the user expanded. The state is keyed on `content` (texts,
 * contextLines, stableKeys of the options): when the content changes every block starts
 * collapsed again, while an unrelated re-render keeps the expanded blocks.
 */
export function useExpanded(content: readonly unknown[]) {
  const version = useContentVersion(content);
  const [state, setState] = useState<{ version: number; blocks: ReadonlySet<number> }>({ version, blocks: NONE });
  const expanded = state.version === version ? state.blocks : NONE;
  const expand = (block: number) => {
    setState((prev) => {
      const blocks = new Set(prev.version === version ? prev.blocks : NONE);
      blocks.add(block);
      return { version, blocks };
    });
  };
  return { expanded, expand };
}
