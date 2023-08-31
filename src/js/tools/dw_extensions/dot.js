export function dot(ctx, point, options) {
    if (!options) options = {};
    if (!options.size) options.size = 1;
    if (!options.color) options.color = 'red';
    if (!options.fillColor) options.fillColor = 'transparent';
    if (!options.lineWidth) options.lineWidth = options.size;

    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    ctx.fillStyle = options.fillColor;

    const size = options.size;
    const radius = Math.ceil(size / 2);

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

export function cross(ctx, point, options) {
    ctx.beginPath();
    ctx.strokeStyle = options.color || 'red';
    ctx.lineWidth = options.lineWidth || 1;
    const size = options.size || 5;
    ctx.moveTo(point.x - size, point.y - size);
    ctx.lineTo(point.x + size, point.y + size);
    ctx.moveTo(point.x + size, point.y - size);
    ctx.lineTo(point.x - size, point.y + size);
    ctx.stroke();
}

export function plus(ctx, point, options) {
    ctx.beginPath();
    ctx.strokeStyle = options.color || 'red';
    ctx.lineWidth = options.lineWidth || 1;
    const size = options.size || 5;
    ctx.moveTo(point.x - size, point.y);
    ctx.lineTo(point.x + size, point.y);
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x, point.y + size);
    ctx.stroke();
}
