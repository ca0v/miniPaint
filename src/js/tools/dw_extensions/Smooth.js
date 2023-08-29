import { center } from './center.js';
import { distance } from './distance.js';

export class Smooth {
  smooth(data) {
    if (data.length < 3) return data;

    // generate new points which fit the data using a bezier curve
    const result = [];

    for (let i = 0; i < data.length; i++) {
      const p1 = data.at((i - 1 + data.length) % data.length);
      const p2 = data.at((i + 0) % data.length);
      const p3 = data.at((i + 1) % data.length);

      try {
        const circle = this.centerOfCircle(p1, p2, p3);
        const angle1 = this.radianOfPoint(circle, center(p1, p2));
        const angle2 = this.radianOfPoint(circle, center(p2, p3));
        result.push(this.arcPoint(circle, angle1));
        result.push(p2);
        result.push(p2);
        result.push(this.arcPoint(circle, angle2));
      } catch (ex) {
        // ignore this point
      }
    }

    const averages = [];
    // find the center of each pair of points
    for (let i = 0; i < result.length; i += 2) {
      const pBefore = result.at((i - 2 + result.length) % result.length);
      const p1 = result.at((i - 1 + result.length) % result.length);
      const p2 = result.at(i % result.length);
      const pAfter = result.at((i + 1) % result.length);
      const pCenter = center(pBefore, pAfter);
      const d1 = distance(p1, pCenter);
      const d2 = distance(p2, pCenter);
      if (d1 < d2) {
        averages.push(p1);
      } else if (d2 < d1) {
        averages.push(p2);
      } else {
        averages.push(center(p1, p2));
      }
    }

    return averages;
  }

  smoothAroundVertex(data, vertexIndex) {
    if (data.length < 3) return false;

    const p1 = data.at((vertexIndex - 1 + data.length) % data.length);
    const p2 = data.at((vertexIndex + 0) % data.length);
    const p3 = data.at((vertexIndex + 1) % data.length);

    try {
      const circle = this.centerOfCircle(p1, p2, p3);
      const angle1 = this.radianOfPoint(circle, center(p1, p2));
      const angle2 = this.radianOfPoint(circle, center(p2, p3));
      const leftOf = this.arcPoint(circle, angle1);
      const rightOf = this.arcPoint(circle, angle2);
      data.splice(vertexIndex, 1, leftOf, p2, rightOf);
    } catch (ex) {
      // ignore this point
      return false;
    }
    return true;
  }

  smoothAroundMinorVertex(data, vertexIndex) {
    if (data.length < 4) return false;

    const p1 = data.at((vertexIndex - 1 + data.length) % data.length);
    const p2 = data.at((vertexIndex + 0) % data.length);
    const p3 = data.at((vertexIndex + 1) % data.length);
    const p4 = data.at((vertexIndex + 2) % data.length);

    const circle1 = this.centerOfCircle(p1, p2, p3);
    const angle1 = this.radianOfPoint(circle1, center(p2, p3));
    const rightOf = this.arcPoint(circle1, angle1);

    const circle2 = this.centerOfCircle(p2, p3, p4);
    const angle2 = this.radianOfPoint(circle2, center(p2, p3));
    const leftOf = this.arcPoint(circle2, angle2);

    const middle = center(leftOf, rightOf);
    data.splice(vertexIndex + 1, 0, middle);
    return true;
  }

  centerOfCircle(p1, p2, p3) {
    // from https://stackoverflow.com/questions/4103405/what-is-the-algorithm-for-finding-the-center-of-a-circle-from-three-points
    const center = { x: 0, y: 0, r: 0 };
    const ax = (p1.x + p2.x) / 2;
    const ay = (p1.y + p2.y) / 2;
    const ux = p1.y - p2.y;
    const uy = p2.x - p1.x;
    const bx = (p2.x + p3.x) / 2;
    const by = (p2.y + p3.y) / 2;
    const vx = p2.y - p3.y;
    const vy = p3.x - p2.x;
    const dx = ax - bx;
    const dy = ay - by;
    const vu = vx * uy - vy * ux;
    if (vu == 0) throw `Points are collinear: ${JSON.stringify({ p1, p2, p3 })}`;
    const g = (dx * uy - dy * ux) / vu;
    center.x = bx + g * vx;
    center.y = by + g * vy;
    center.r = Math.sqrt((p1.x - center.x) ** 2 + (p1.y - center.y) ** 2);
    return center;
  }

  radianOfPoint(circle, point) {
    const a = Math.atan2(point.y - circle.y, point.x - circle.x);
    return a < 0 ? a + 2 * Math.PI : a;
  }

  arcPoint(circle, angle) {
    const x = circle.x + circle.r * Math.cos(angle);
    const y = circle.y + circle.r * Math.sin(angle);
    return { x, y };
  }
}
