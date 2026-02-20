export function normalizeHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\-]/g, "");
}

export function redactedText(value: string): string {
  if (!value) {
    return "";
  }
  return "•".repeat(Math.min(32, Math.max(4, value.length)));
}
