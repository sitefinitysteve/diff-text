import { useId, useMemo } from 'react';
import { fromKey, generatedIdPrefix, resolveIdPrefix, stableKey } from './model';

/**
 * The id prefix of a component: the idPrefix prop when it is a non-empty string, else
 * "td-" + useId() (characters invalid in ids and CSS selectors removed), which is unique
 * per instance and identical on the server and during hydration.
 */
export function useIdPrefix(prop: string | undefined): string {
  const id = useId();
  return resolveIdPrefix(prop, generatedIdPrefix(id));
}

/**
 * An options object that keeps its identity while its content is equal (by stableKey),
 * plus that key. Memoized models depend on it, so an inline `options={{...}}` does not
 * recompute (or reset) anything on unrelated re-renders.
 */
export function useStableOptions<T>(options: T): [T, string] {
  const key = stableKey(options);
  const stable = useMemo(() => fromKey<T>(key), [key]);
  return [stable, key];
}
