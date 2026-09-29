/**
 * DOM helpers behind next() / prev() / goTo() on every diff view.
 * This file is byte-identical in packages/vue and packages/react.
 */

/** Class toggled on the element of the current change. */
export const CURRENT_CLASS = 'is-current';

/** Wrap any integer into [0, count). */
export function wrapIndex(index: number, count: number): number {
  const i = Math.trunc(index) || 0;
  return ((i % count) + count) % count;
}

/** Remove the current-change marker from every element under root. */
export function clearCurrent(root: Element | null | undefined): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>(`.${CURRENT_CLASS}`).forEach((el) => {
    el.classList.remove(CURRENT_CLASS);
  });
}

/** Mark `[data-change-index=index]` under root as current and scroll it into view. */
export function markCurrent(root: Element | null | undefined, index: number): void {
  clearCurrent(root);
  if (!root) return;
  const el = root.querySelector<HTMLElement>(`[data-change-index="${index}"]`);
  if (!el) return;
  el.classList.add(CURRENT_CLASS);
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Navigation state machine shared by both frameworks. `getRoot` and `getCount`
 * are read on every call, so the controller never holds stale values.
 */
export function createNavigator(getRoot: () => Element | null | undefined, getCount: () => number) {
  let current = -1;
  const goTo = (index: number): number => {
    const count = getCount();
    if (count <= 0) {
      current = -1;
      clearCurrent(getRoot());
      return -1;
    }
    current = wrapIndex(index, count);
    markCurrent(getRoot(), current);
    return current;
  };
  return {
    goTo,
    next: (): number => goTo(current < 0 ? 0 : current + 1),
    prev: (): number => goTo(current < 0 ? getCount() - 1 : current - 1),
    reset: (): void => {
      current = -1;
      clearCurrent(getRoot());
    },
  };
}
