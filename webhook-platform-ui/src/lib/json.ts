/**
 * Pretty-prints a JSON string, returning it unchanged when it is not JSON.
 *
 * <p>A webhook body is whatever the sender put in it: showing the raw text is the honest answer
 * for a payload that never parsed.
 */
export function formatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/** Whether a string parses as JSON at all — for a form that only accepts one. */
export function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
