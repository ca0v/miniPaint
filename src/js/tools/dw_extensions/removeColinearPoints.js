import { distance } from './distance.js';

export function removeColinearPoints(points) {
  if (points.length < 3) return points;
  const result = [];
  const n = points.length;

  result.push(points.at(0));

  for (let i = 1; i < n - 1; i++) {
    const priorPoint = result.at(-1);
    const currentPoint = points.at(i);
    const nextPoint = points.at(i + 1);
    const priorDistance = distance(priorPoint, currentPoint);
    const nextDistance = distance(currentPoint, nextPoint);
    const totalDistance = distance(priorPoint, nextPoint);

    if (priorDistance + nextDistance > totalDistance) {
      result.push(currentPoint);
    } else {
      //colinear
    }
  }

  const lastPoint = points.at(-1);
  if (distance(lastPoint, result.at(-1))) {
    result.push(lastPoint);
  }

  return result;
}
