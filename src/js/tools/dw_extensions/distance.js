export function distance(p1, p2) {
    const dist_x = p1.x - p2.x;
    const dist_y = p1.y - p2.y;
    return Math.sqrt(dist_x * dist_x + dist_y * dist_y);
}
