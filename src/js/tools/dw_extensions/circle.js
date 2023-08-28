export function circle(ctx, center, size) {
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.floor(size / 2) + 1, 0, 2 * Math.PI);

  ctx.fill();
  ctx.stroke();
}
