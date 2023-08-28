export function computeMouseState(e) {
  const { ctrlKey, altKey, shiftKey } = e;
  // is left or right mouse button down?
  const button = e.button === 0 ? 'Left+' : e.button === 2 ? 'Right+' : '';
  return `${ctrlKey ? 'Ctrl+' : ''}${altKey ? 'Alt+' : ''}${shiftKey ? 'Shift+' : ''}${button}${e.type}`;
}
