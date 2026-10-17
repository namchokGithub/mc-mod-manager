import { useEffect, useEffectEvent, useState } from "react";
import { ModrinthError } from "../../lib/modrinth/api";

type Settled<T> = { key: string; data?: T; error?: ModrinthError };

export type RequestState<T> = {
  loading: boolean;
  data?: T;
  /** Last successful result, even when a newer request is still loading. */
  latest?: T;
  error?: ModrinthError;
  retry: () => void;
};

/**
 * Runs a Modrinth request whenever `key` changes; a null key means idle.
 * Superseded requests are aborted, so stale responses never replace newer ones.
 */
export function useModrinthRequest<T>(
  key: string | null,
  run: (signal: AbortSignal) => Promise<T>,
  delay = 0,
): RequestState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [latest, setLatest] = useState<T | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const requestKey = key === null ? null : `${key}#${attempt}`;
  const start = useEffectEvent((signal: AbortSignal) => run(signal));

  useEffect(() => {
    if (requestKey === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      start(controller.signal).then(
        (data) => {
          setSettled({ key: requestKey, data });
          setLatest(data);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setSettled({
            key: requestKey,
            error:
              error instanceof ModrinthError
                ? error
                : new ModrinthError(
                    "invalid-response",
                    "Something went wrong while talking to Modrinth.",
                  ),
          });
        },
      );
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, delay]);

  const current = settled?.key === requestKey ? settled : undefined;
  return {
    loading: requestKey !== null && !current,
    data: current?.data,
    latest,
    error: current?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
