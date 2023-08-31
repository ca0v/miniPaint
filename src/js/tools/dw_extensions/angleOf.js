import { distance } from './distance.js';

export function angleOf(p1, p2, p3) {
    const a = distance(p1, p2);
    const b = distance(p2, p3);
    const c = distance(p1, p3);
    return Math.acos((a * a + b * b - c * c) / (2 * a * b));
}
