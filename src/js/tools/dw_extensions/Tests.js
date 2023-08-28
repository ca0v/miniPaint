import { Smooth } from './Smooth.js';

export class Tests {
  tests() {
    const vision = new Smooth();

    {
      vision.arcPoint; // tests

      const circle = { x: 0, y: 0, r: 1 };
      this.eq(1, vision.arcPoint(circle, 0).x, 'A circle at origin with radius 1 at 0 degrees should be at (1,0)');

      this.eq(0, vision.arcPoint(circle, 0).y, 'A circle at origin with radius 1 at 0 degrees should be at (1,0)');

      {
        this.eq(
          0,
          vision.arcPoint(circle, Math.PI / 2).x,
          `A circle at origin with radius 1 at 90 degrees should be at (0,_)`,
        );
      }

      this.eq(
        1,
        vision.arcPoint(circle, Math.PI / 2).y,
        'A circle at origin with radius 1 at 90 degrees should be at (_,1)',
      );
    }

    {
      vision.radianOfPoint; // tests

      const circle = { x: 0, y: 0, r: 1 };
      this.eq(
        0,
        vision.radianOfPoint(circle, { x: 1, y: 0 }),
        'A circle at origin with radius 1 at (1,0) should be at 0 degrees',
      );

      this.eq(
        Math.PI / 2,
        vision.radianOfPoint(circle, { x: 0, y: 1 }),
        'A circle at origin with radius 1 at (0,1) should be at 90 degrees',
      );

      this.eq(
        Math.PI,
        vision.radianOfPoint(circle, { x: -1, y: 0 }),
        'A circle at origin with radius 1 at (-1,0) should be at 180 degrees',
      );

      this.eq(
        (3 * Math.PI) / 2,
        vision.radianOfPoint(circle, { x: 0, y: -1 }),
        'A circle at origin with radius 1 at (0,-1) should be at 270 degrees',
      );
    }

    {
      vision.centerOfCircle; // tests

      let circle = vision.centerOfCircle({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
      this.eq(0, circle.x, 'The center of a circle with points (0,0), (1,0), (0,1) should be at (0,_)');
      this.eq(0, circle.y, 'The center of a circle with points (0,0), (1,0), (0,1) should be at (_,0)');
      this.eq(1, circle.r, 'The radius of a circle with points (0,0), (1,0), (0,1) should be 1');
    }

    {
      vision.smooth; // tests

      const p0 = { x: 0, y: 0 };
      const p1 = { x: 1, y: 0 };
      const p2 = { x: 0, y: 1 };
      const p3 = { x: -1, y: 1 };
      const p4 = { x: -2, y: 1 };

      this.eq(0, vision.smooth([]).length, 'The result should be empty');
      this.eq(1, vision.smooth([p0]).length, 'The result should be a single point');
      this.eq(2, vision.smooth([p0, p0]).length, 'The result should be the same two points');
      this.eq(
        6,
        vision.smooth([p0, p1, p2]).length,
        'Three interpolated points should be injected into the original set of three points',
      );

      this.eq(
        8,
        vision.smooth([p0, p1, p2, p3]).length,
        'An interpolation point was added between every non-colinear pair of points (including between the last and first)',
      );

      this.eq(
        8,
        vision.smooth([p0, p1, p2, p3, p4]).length,
        'An interpolation point was added between every non-colinear pair of points (p4 is thrown out)',
      );

      const smooth = vision.smooth([p0, p1, p2]);
      this.eq(p0.x, smooth[1].x, 'There is now an interpolated point before the original 1st point');
    }
  }

  eq(expected, actual, assertion) {
    if (typeof actual === 'number') actual = actual.toFixed(6);
    if (typeof expected === 'number') expected = expected.toFixed(6);
    console.assert(
      expected === actual,
      `${assertion}: the actual value was ${actual} but the expected value was ${expected}`,
    );
  }

  radToDeg(rad) {
    return Math.round((rad * 180) / Math.PI);
  }
}
