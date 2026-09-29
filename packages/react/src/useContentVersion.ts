import { useState } from 'react';

function sameContent(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * A number that changes exactly when one of `content` changes (compared element by element
 * with Object.is). Views key their UI state on it, passing content (texts, contextLines, a
 * stableKey of the options), so an unrelated parent re-render with an equal options object
 * resets nothing. Uses React's "adjust state while rendering" pattern.
 */
export function useContentVersion(content: readonly unknown[]): number {
  const [state, setState] = useState({ content, version: 0 });
  if (sameContent(state.content, content)) return state.version;
  const version = state.version + 1;
  setState({ content, version });
  return version;
}
