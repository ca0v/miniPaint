export function dot(ctx, point) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 0.5, 0, 2 * Math.PI);
  ctx.stroke();
}
