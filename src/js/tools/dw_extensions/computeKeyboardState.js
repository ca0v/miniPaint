export function computeKeyboardState(e, otherKeys) {
    const downKeys = [...otherKeys].join('+');
    console.log(downKeys);
    return downKeys;
}
