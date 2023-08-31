export function circle(ctx, center, options) {
    if (!options) options = {};
    if (!options.size) options.size = 5;
    if (!options.color) options.color = 'red';
    if (!options.fillColor) options.fillColor = 'transparent';
    if (!options.lineWidth) options.lineWidth = 1;

    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    ctx.fillStyle = options.fillColor;

    const size = options.size;
    const radius = 0.5 * size;

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}
