export function computeKeyboardState(e, otherKeys) {
    return [...otherKeys].join('+');
}
