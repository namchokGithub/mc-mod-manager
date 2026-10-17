import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { COUNT_UP_DURATION_MS, countUpValue } from "../../lib/countUp";

const observerSupported = typeof IntersectionObserver !== "undefined";

/**
 * Counts `values` up from 0 once, when the referenced element first enters the viewport.
 * Reduced motion, missing IntersectionObserver, and zero values show the final number at once.
 * After the animation, the live values are shown, so later data changes never replay it.
 */
export function useCountUp<T extends Element>(
  values: number[],
  duration = COUNT_UP_DURATION_MS,
) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<T>(null);
  // Milliseconds since the animation started; null until the element is seen.
  const [elapsed, setElapsed] = useState<number | null>(null);
  const skip = Boolean(reduceMotion) || !observerSupported;

  useEffect(() => {
    const element = ref.current;
    if (skip || !element) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const time = Math.min(duration, now - start);
          setElapsed(time);
          if (time < duration) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [skip, duration]);

  const done = skip || (elapsed !== null && elapsed >= duration);
  const shown = values.map((value) =>
    done ? value : countUpValue(value, elapsed ?? 0, duration),
  );
  return { ref, shown };
}
