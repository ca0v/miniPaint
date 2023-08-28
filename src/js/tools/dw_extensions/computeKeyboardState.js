export function computeKeyboardState(e) {
  const { key, ctrlKey, altKey, shiftKey } = e;
  return `${ctrlKey ? 'Ctrl+' : ''}${altKey ? 'Alt+' : ''}${shiftKey ? 'Shift+' : ''}${key}`;
}
