import { Smooth } from './Smooth.js';
import { StateMachine } from './StateMachine.js';
import { isShortcutMatch } from './isShortcutMatch.js';

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function eq(expected, actual, assertion) {
    if (typeof actual === 'number') actual = actual.toFixed(6);
    if (typeof expected === 'number') expected = expected.toFixed(6);
    console.assert(
        expected === actual,
        `${assertion}: the actual value was ${actual} but the expected value was ${expected}`,
    );
}

export class Tests {
    async tests() {
        await sleep(1000);
        this.testSmoothing();
        this.testStateMachine();

        {
            // isShortcutMatch
            eq(
                true,
                isShortcutMatch('Shift+Left+mousedown', 'Shift+Left+mousedown'),
            );
            eq(
                true,
                isShortcutMatch('Shift+Left+mousedown', 'Left+Shift+mousedown'),
            );
            eq(
                false,
                isShortcutMatch('Shift+Left+mousedown', 'Left+mousedown'),
            );
            eq(
                false,
                isShortcutMatch('Left+mousedown', 'Shift+Left+mousedown'),
            );
        }
    }

    testSmoothing() {
        const vision = new Smooth();

        {
            vision.arcPoint; // tests

            const circle = { x: 0, y: 0, r: 1 };
            eq(
                1,
                vision.arcPoint(circle, 0).x,
                'A circle at origin with radius 1 at 0 degrees should be at (1,0)',
            );

            eq(
                0,
                vision.arcPoint(circle, 0).y,
                'A circle at origin with radius 1 at 0 degrees should be at (1,0)',
            );

            {
                eq(
                    0,
                    vision.arcPoint(circle, Math.PI / 2).x,
                    `A circle at origin with radius 1 at 90 degrees should be at (0,_)`,
                );
            }

            eq(
                1,
                vision.arcPoint(circle, Math.PI / 2).y,
                'A circle at origin with radius 1 at 90 degrees should be at (_,1)',
            );
        }

        {
            vision.radianOfPoint; // tests

            const circle = { x: 0, y: 0, r: 1 };
            eq(
                0,
                vision.radianOfPoint(circle, { x: 1, y: 0 }),
                'A circle at origin with radius 1 at (1,0) should be at 0 degrees',
            );

            eq(
                Math.PI / 2,
                vision.radianOfPoint(circle, { x: 0, y: 1 }),
                'A circle at origin with radius 1 at (0,1) should be at 90 degrees',
            );

            eq(
                Math.PI,
                vision.radianOfPoint(circle, { x: -1, y: 0 }),
                'A circle at origin with radius 1 at (-1,0) should be at 180 degrees',
            );

            eq(
                (3 * Math.PI) / 2,
                vision.radianOfPoint(circle, { x: 0, y: -1 }),
                'A circle at origin with radius 1 at (0,-1) should be at 270 degrees',
            );
        }

        {
            vision.centerOfCircle; // tests

            let circle = vision.centerOfCircle(
                { x: -1, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            );
            eq(
                0,
                circle.x,
                'The center of a circle with points (0,0), (1,0), (0,1) should be at (0,_)',
            );
            eq(
                0,
                circle.y,
                'The center of a circle with points (0,0), (1,0), (0,1) should be at (_,0)',
            );
            eq(
                1,
                circle.r,
                'The radius of a circle with points (0,0), (1,0), (0,1) should be 1',
            );
        }

        {
            vision.smooth; // tests

            const p0 = { x: 0, y: 0 };
            const p1 = { x: 1, y: 0 };
            const p2 = { x: 0, y: 1 };
            const p3 = { x: -1, y: 1 };
            const p4 = { x: -2, y: 1 };

            eq(0, vision.smooth([]).length, 'The result should be empty');
            eq(
                1,
                vision.smooth([p0]).length,
                'The result should be a single point',
            );
            eq(
                2,
                vision.smooth([p0, p0]).length,
                'The result should be the same two points',
            );
            eq(
                6,
                vision.smooth([p0, p1, p2]).length,
                'Three interpolated points should be injected into the original set of three points',
            );

            eq(
                8,
                vision.smooth([p0, p1, p2, p3]).length,
                'An interpolation point was added between every non-colinear pair of points (including between the last and first)',
            );

            eq(
                8,
                vision.smooth([p0, p1, p2, p3, p4]).length,
                'An interpolation point was added between every non-colinear pair of points (p4 is thrown out)',
            );

            const smooth = vision.smooth([p0, p1, p2]);
            eq(
                p0.x,
                smooth[1].x,
                'There is now an interpolated point before the original 1st point',
            );
        }
    }

    testStateMachine() {
        {
            const s = new StateMachine(['none', 'drawing']);
            s.setCurrentState(s.states.none);

            let hit = false;

            // register the event handlers
            s.register({
                shiftClickCallbackTest: () => {
                    console.log(`shiftClickCallbackTest`);
                    hit = true;
                },
            });

            // register the events to be handled
            s.about('')
                .from(s.states.none)
                .goto(s.states.drawing)
                .when('Shift+Left+mousedown')
                .do(s.actions.shiftClickCallbackTest);

            // simulate a shift+left+mousedown
            //document.dispatchEvent(new MouseEvent('mousedown', { shiftKey: true, button: 0 }));
            s.trigger('Shift+Left+mousedown');
            eq(
                true,
                hit,
                'The shiftClickCallbackTest handler should have been called',
            );
            eq(
                s.states.drawing,
                s.currentState,
                'The state should have changed to drawing',
            );

            s.off();
        }

        {
            const s = new StateMachine(['none', 's1']);
            s.setCurrentState(s.states.none);

            let hit = false;
            s.register({
                keypressCallbackTest: () => {
                    console.log(`keypressCallbackTest`);
                    hit = true;
                },
            });

            s.about('')
                .from(s.states.none)
                .goto(s.states.drawing)
                .when('Ctrl+Shift+X')
                .do(s.actions.keypressCallbackTest);

            // simulate a ctrl+shift+arrowLeft keypress
            const event = new KeyboardEvent('keydown', {
                key: 'X',
                ctrlKey: true,
                shiftKey: true,
                target: null,
            });
            // document.dispatchEvent(event);
            s.trigger('Ctrl+Shift+X');
            eq(
                true,
                hit,
                'The keypressCallbackTest handler should have been called',
            );

            s.off();
        }
    }
}
