export function dot(ctx, point) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 0.5, 0, 2 * Math.PI);
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
