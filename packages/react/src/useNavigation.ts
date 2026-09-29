import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { ForwardedRef } from 'react';
import type { DiffNavigation } from './model';
import { createNavigator } from './navigation';
import { useContentVersion } from './useContentVersion';

type Navigator = ReturnType<typeof createNavigator>;

/**
 * Wires next()/prev()/goTo()/count to a component's root element through its ref.
 * The current change is cleared whenever one of `content` changes (see useContentVersion).
 * `count` on the handle is a getter, so it is always the current value.
 * Returns the ref to attach to the root element.
 */
export function useNavigation(ref: ForwardedRef<DiffNavigation>, count: number, content: readonly unknown[]) {
  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);
  const navRef = useRef<Navigator | null>(null);
  const version = useContentVersion(content);

  useLayoutEffect(() => {
    countRef.current = count;
  }, [count]);

  // Created on first use (outside render), then stable for the component's lifetime.
  const nav = useCallback((): Navigator => {
    if (!navRef.current) {
      navRef.current = createNavigator(
        () => rootRef.current,
        () => countRef.current,
      );
    }
    return navRef.current;
  }, []);

  useEffect(() => {
    nav().reset();
  }, [nav, version]);

  useImperativeHandle(
    ref,
    () => ({
      next: () => nav().next(),
      prev: () => nav().prev(),
      goTo: (index: number) => nav().goTo(index),
      get count() {
        return countRef.current;
      },
    }),
    [nav],
  );

  return rootRef;
}
