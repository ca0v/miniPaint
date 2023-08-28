export function deep(obj) {
  return JSON.parse(JSON.stringify(obj));
}
