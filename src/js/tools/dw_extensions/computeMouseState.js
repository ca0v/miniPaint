export function computeMouseState(e, otherKeys) {
    if (!otherKeys) return e.type;
    const button = ['', 'Left', 'Right'][e.buttons];
    return [...otherKeys, button, e.type].filter((v) => !!v).join('+');
}
