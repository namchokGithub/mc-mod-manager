import { useState } from "react";

// Keeps the last non-null value so dialog content stays visible while it animates closed.
export function useRetained<T>(value: T | null): T | null {
  const [retained, setRetained] = useState(value);
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}
