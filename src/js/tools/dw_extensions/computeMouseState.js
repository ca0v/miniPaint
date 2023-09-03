export function computeMouseState(e, otherKeys) {
    if (!otherKeys) return e.type;
    let downKeys = [...otherKeys].join('+');
    if (downKeys) downKeys += '+';
    // is left or right mouse button down?
    const button = e.buttons === 1 ? 'Left+' : e.buttons === 2 ? 'Right+' : '';
   
    downKeys = `${downKeys}${button}${e.type}`;
    console.log(downKeys);
    return downKeys;
}
