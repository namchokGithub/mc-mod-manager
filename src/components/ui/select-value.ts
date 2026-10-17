// Radix Select reserves "" for "no selection", but the app uses "" as a real option value
// ("All categories", "Any version"). These helpers swap it for a sentinel at the boundary.
export const EMPTY_VALUE = "__empty__";

export function toItemValue(value: string): string {
  return value === "" ? EMPTY_VALUE : value;
}

export function fromItemValue(value: string): string {
  return value === EMPTY_VALUE ? "" : value;
}

/** Returns the label for a value, or undefined when no option has it. */
export function labelFor<T extends { value: string; label: string }>(
  options: T[],
  value: string | undefined,
): string | undefined {
  return value === undefined
    ? undefined
    : options.find((option) => option.value === value)?.label;
}
