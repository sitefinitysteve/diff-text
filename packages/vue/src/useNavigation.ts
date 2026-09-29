import { ref, watch } from 'vue';
import type { ComputedRef, WatchSource } from 'vue';
import { createNavigator } from './navigation';

/**
 * Wires next()/prev()/goTo()/count to a component's root element.
 * The current change is cleared whenever one of `resetOn` changes. Pass content
 * (texts, contextLines, a stableKey of the options), not a model object: an unrelated
 * parent re-render that passes an equal options object must not clear it.
 * `count` is exposed as a computed ref, so `ref.count` is always the current value.
 */
export function useNavigation(count: ComputedRef<number>, resetOn: WatchSource[]) {
  const root = ref<HTMLElement | null>(null);
  const nav = createNavigator(
    () => root.value,
    () => count.value,
  );
  watch(resetOn, () => nav.reset());
  return {
    root,
    exposed: { next: nav.next, prev: nav.prev, goTo: nav.goTo, count },
  };
}
