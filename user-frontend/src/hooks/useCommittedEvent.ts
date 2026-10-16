import { useCallback, useLayoutEffect, useRef } from 'react';

/** Stable event listener with the callback from the latest committed render. */
export function useCommittedEvent<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const handler = useRef(callback);
  useLayoutEffect(() => { handler.current = callback; });
  return useCallback((...args: Args) => handler.current(...args), []);
}
