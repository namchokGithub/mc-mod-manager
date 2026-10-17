// DOM-free so the dev server plugin can share it: exports, drafts, and saved files all use
// exactly this format.
export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
