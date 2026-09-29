import * as vue from 'vue';
import { computed, getCurrentInstance } from 'vue';
import type { ComputedRef } from 'vue';
import { generatedIdPrefix, resolveIdPrefix } from './model';

// useId() exists from Vue 3.5. The peer range is ^3.0.0, so look it up at runtime instead of
// importing it by name (a named import of a missing export fails to link in strict ESM).
const USE_ID = 'useId';
const vueUseId = (vue as unknown as Record<string, (() => string) | undefined>)[USE_ID];

/**
 * The id prefix of a component: the idPrefix prop when it is a non-empty string, else a
 * default that is unique per instance. On Vue 3.5+ the default comes from useId(), so it
 * is the same on the server and during hydration. On older Vue it falls back to the
 * component uid, which is unique but NOT stable across SSR and hydration: SSR users on
 * Vue < 3.5 should pass idPrefix explicitly.
 */
export function useIdPrefix(prop: () => string | undefined): ComputedRef<string> {
  const id = vueUseId ? vueUseId() : `u${getCurrentInstance()?.uid ?? 0}`;
  const generated = generatedIdPrefix(id);
  return computed(() => resolveIdPrefix(prop(), generated));
}
