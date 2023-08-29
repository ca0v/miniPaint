export function circle(ctx, center, options) {
  const size = options.size || 5;

  ctx.strokeStyle = options.color || 'red';
  ctx.lineWidth = options.lineWidth || 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.floor(size / 2) + 1, 0, 2 * Math.PI);

  ctx.fill();
  ctx.stroke();
}
