import { useCallback, useLayoutEffect, useRef } from 'react';

/** Imperative handlers use committed state without restarting subscription effects. */
export function useCommittedEvent<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const handler = useRef(callback);
  useLayoutEffect(() => { handler.current = callback; });
  return useCallback((...args: Args) => handler.current(...args), []);
}
