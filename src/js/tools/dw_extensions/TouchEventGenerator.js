import { EventManager } from './EventManager.js';
import { verbose } from './log.js';

const MIN_TIME = 100;

export class TouchEventGenerator {
    constructor(target = document.body) {
        this.target = target;
        this.events = new EventManager(target);
        this.events.on('touchstart', (touchEvent) =>
            this.touchStartHandler(touchEvent),
        );
    }

    on(eventName, callback) {
        return this.events.on(eventName, callback);
    }

    off() {
        this.events.off();
    }

    trigger(eventName, eventData) {
        this.events.trigger(eventName, eventData);
    }

    complete() {
        verbose('completing touch');
        this.touchHandle?.off();
        this.touchHandle = null;
    }

    abort() {
        verbose('aborting touch');
        this.touchHandle?.off();
        this.touchHandle = null;
        this.trigger('abort');
    }

    touchStartHandler(touchEvent) {
        verbose('touchStartHandler', touchEvent);

        // capture the location of the touch
        this.physics = this.computePhysics(Array.from(touchEvent.touches));

        // if already handling a touch, abort it
        if (this.touchHandle) {
            // user has added a finger while touching
            this.trigger('touch:add', { physics: this.physics });
            return;
        }

        // listen for a touchmove and touchend
        const h1 = this.on('touchmove', (e) => this.touchMoveHandler(e));
        const h2 = this.on('touchend', (e) => this.touchEndHandler(e));
        const h3 = this.on('touchcancel', (e) => this.touchCancelHandler(e));

        // create a handle to abort the touch
        this.touchHandle = {
            off: () => {
                this.touchHandle = null;
                this.physics = null;
                h1.off();
                h2.off();
                h3.off();
            },
        };

        this.trigger(
            'touch:begin',
            Object.assign(touchEvent, { physics: this.physics }),
        );
    }

    touchCancelHandler(touchEvent) {
        verbose('touchCancelHandler', touchEvent);
        this.abort();
    }

    touchMoveHandler(touchEvent) {
        verbose('touchMoveHandler', touchEvent);

        // if user adds a finger while moving, trigger a synthetic touchstart
        if (this.physics.length < touchEvent.touches.length) {
            this.trigger('touch:add', { physics: this.physics });
        } else if (this.physics.length > touchEvent.touches.length) {
            this.trigger('touch:remove', { physics: this.physics });
        }

        this.physics = this.computePhysics(
            Array.from(touchEvent.touches),
            this.physics,
        );

        if (PhysicalAnalyzers.isDragDrag(this.physics)) {
            this.trigger('touch:dragdrag', { physics: this.physics });
            return;
        }

        if (PhysicalAnalyzers.isPinch(this.physics)) {
            const direction = PhysicalAnalyzers.getPinchDirection(this.physics);
            verbose('pinchorspread', direction);
            switch (direction) {
                case 'in':
                    this.trigger('touch:pinch', { physics: this.physics });
                    break;
                case 'out':
                    this.trigger('touch:spread', { physics: this.physics });
                    break;
                default:
                    throw `Invalid pinch direction: ${direction}`;
            }
            return;
        }

        if (PhysicalAnalyzers.isDrag(this.physics)) {
            this.trigger(
                'touch:drag',
                Object.assign(touchEvent, { physics: this.physics }),
            );
            return;
        }
    }

    touchEndHandler(touchEvent) {
        verbose('touchEndHandler', touchEvent);
        if (touchEvent.touches.length === 0) {
            this.complete();
            this.trigger('touch:complete', { physics: this.physics });
        }
    }

    computePhysics(touches, priorPhysics) {
        const initializePhysics = (t) => {
            return {
                time: Date.now(),
                start: { x: t.clientX, y: t.clientY },
                position: { x: t.clientX, y: t.clientY },
                velocity: { x: 0, y: 0 },
                acceleration: { x: 0, y: 0 },
                degree: 0,
                speed: 0,
            };
        };

        if (!priorPhysics) {
            return touches.map((t) => initializePhysics(t));
        }

        if (touches.length > priorPhysics.length) {
            for (let i = priorPhysics.length; i < touches.length; i++) {
                priorPhysics[i] = initializePhysics(touches[i]);
            }
        }

        if (touches.length > priorPhysics.length) {
            throw new Error(
                `Must have physical items for each touch point but got ${touches.length} touches and ${priorPhysics.length} physical items`,
            );
        }

        const currentTime = Date.now();

        return touches.map((t, i) => {
            const prior = priorPhysics[i];

            const timeDiff = currentTime - prior.time;
            verbose('timeDiff', timeDiff);

            if (timeDiff < MIN_TIME) return { ...prior };

            const position = { x: t.clientX, y: t.clientY };
            const velocity = {
                x: (1000 * (position.x - prior.position.x)) / timeDiff,
                y: (1000 * (position.y - prior.position.y)) / timeDiff,
            };
            const acceleration = {
                x: (1000 * (velocity.x - prior.velocity.x)) / timeDiff,
                y: (1000 * (velocity.y - prior.velocity.y)) / timeDiff,
            };

            if (velocity.x === 0 && velocity.x === 0) {
                verbose(`velocity`, {
                    timeDiff,
                    position,
                    prior: prior.position,
                });
            }

            const angle = Math.atan2(velocity.y, velocity.x);

            const speed = Math.sqrt(
                velocity.x * velocity.x + velocity.y * velocity.y,
            );

            return {
                time: currentTime,
                start: prior.start,
                position,
                velocity,
                acceleration,
                degree: positiveDegree((angle * 180) / Math.PI),
                speed,
            };
        });
    }
}

class PhysicalAnalyzers {
    static isDrag(physics, options) {
        if (physics.length !== 1) return false;
        let { minSpeed } = options || {};
        minSpeed = minSpeed || 10;
        const { speed } = physics[0];
        return speed > minSpeed;
    }

    static isDragDrag(physics, options) {
        // return true if there are two physical elements both traveling in the same direction within d degrees of each other
        if (physics.length !== 2) return false;
        let { degrees, speed, minSpeed } = options || {};
        degrees = degrees || 30; // degrees
        speed = speed || 100; // pixels per second
        minSpeed = minSpeed || 30;

        const [t1, t2] = physics;

        if (t1.speed < minSpeed) {
            verbose('dragdrag', `speed too slow: ${t1.speed}`);
            return false;
        }

        if (t2.speed < minSpeed) {
            verbose('dragdrag', `speed too slow: ${t2.speed}`);
            return false;
        }

        const angleDiff = Math.abs(t1.degree - t2.degree);
        const speedDiff = Math.abs(t1.speed - t2.speed);

        if (angleDiff > degrees) {
            verbose('dragdrag', `angle different too great: ${angleDiff}`);
            return false;
        }
        if (speedDiff > speed) {
            verbose('dragdrag', `speed different too great: ${speedDiff}`);
            return false;
        }

        verbose(
            'xxx',
            `dragdrag: ${Math.round(t1.degree)}~=${Math.round(
                t2.degree,
            )}, ${Math.round(t1.speed)}~=${Math.round(t2.speed)}`,
        );
        return true;
    }

    static isPinch(physics, options) {
        // return true if the two physical elements are moving in opposite directions
        if (physics.length !== 2) return false;
        let { degrees, speed, minSpeed } = options || {};
        degrees = degrees || 45; // degrees
        speed = speed || 100; // pixels per second
        minSpeed = minSpeed || 10;

        const [t1, t2] = physics;

        if (t1.speed + t2.speed < minSpeed) {
            if (t1.speed < minSpeed) {
                verbose(
                    'pinchorspread',
                    `speed 1 too slow: ${t1.speed}`,
                    physics,
                );
            }

            if (t2.speed < minSpeed) {
                verbose(
                    'pinchorspread',
                    `speed 2 too slow: ${t2.speed}`,
                    physics,
                );
            }

            return false;
        }

        const degreeDiff = Math.abs(
            180 - positiveDegree(t1.degree - t2.degree),
        );

        if (degreeDiff > degrees) {
            verbose(
                `pinchorspread`,
                `not moving opposite enough: d1: ${t1.degree}, d2: ${t2.degree}, diff: ${degreeDiff}, threshold: ${degrees}`,
            );
            return false;
        }

        verbose(
            'pinchorspread',
            `${t1.degree}~|${t2.degree}, ${t1.speed}~=${t2.speed}`,
        );

        return true;
    }

    static getPinchDirection(physics, options) {
        if (!PhysicalAnalyzers.isPinch(physics, options)) return false;

        const [t1, t2] = physics;
        const [p1, p2] = [t1.position, t2.position];
        const [v1, v2] = [t1.velocity, t2.velocity];

        if (p1.x < p2.x && v1.x < 0 && v2.x > 0) return 'out';
        if (p1.y < p2.y && v1.y < 0 && v2.y > 0) return 'out';
        if (p1.x > p2.x && v1.x > 0 && v2.x < 0) return 'out';
        if (p1.y > p2.y && v1.y > 0 && v2.y < 0) return 'out';
        return 'in';
    }
}

function positiveDegree(v) {
    return (v + 360) % 360;
}
