export function clockwise(data) {
    // if the data is counterclockwise, reverse it
    const sum = data.reduce((sum, point, i) => {
        const nextPoint = data[(i + 1) % data.length];
        return sum + (nextPoint.x - point.x) * (nextPoint.y + point.y);
    }, 0);

    if (sum < 0) {
        return data.toReversed();
    }

    return data;
}
