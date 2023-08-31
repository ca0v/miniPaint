export function computeMouseState(e) {
    const { ctrlKey, altKey, shiftKey } = e;
    // is left or right mouse button down?
    const button = e.buttons === 1 ? 'Left+' : e.buttons === 2 ? 'Right+' : '';
    return `${ctrlKey ? 'Ctrl+' : ''}${altKey ? 'Alt+' : ''}${
        shiftKey ? 'Shift+' : ''
    }${button}${e.type}`;
}
