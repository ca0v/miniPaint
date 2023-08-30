export function isShortcutMatch(shortcut, currentState) {
  if (!shortcut) return true;
  if (!currentState) return false;
  console.log(shortcut, currentState);
  const shortcutParts = shortcut.split('+');
  const currentStateParts = currentState.split('+');
  const every1 = shortcutParts.every((shortcutPart) => currentStateParts.includes(shortcutPart));
  if (!every1) return false;
  const every2 = currentStateParts.every((currentStatePart) => shortcutParts.includes(currentStatePart));
  if (!every2) return false;
  return true;
}
