import { EventManager } from './EventManager.js';

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
        console.log('completing touch');
        this.touchHandle?.off();
        this.touchHandle = null;
    }

    abort() {
        console.log('aborting touch');
        this.touchHandle?.off();
        this.touchHandle = null;
        this.trigger('abort');
    }

    touchStartHandler(touchEvent) {
        console.log('touchStartHandler', touchEvent);

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

        this.trigger('touch:begin', { physics: this.physics });
    }

    touchCancelHandler(touchEvent) {
        console.log('touchCancelHandler', touchEvent);
        this.abort();
    }

    touchMoveHandler(touchEvent) {
        console.log('touchMoveHandler', touchEvent);

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

        if (this.physics.length === 1) {
            console.log('physics', JSON.stringify(this.physics));
        } else {
            // compute the difference in angle, speed of the two touches
            const [t1, t2] = this.physics;
            const angleDiff = Math.abs(t1.degree - t2.degree);
            const speedDiff = Math.abs(t1.speed - t2.speed);
            const diff = { angleDiff, speedDiff };
            console.log('physics', JSON.stringify(diff));
        }

        if (PhysicalAnalyzers.isDragDrag(this.physics)) {
            this.trigger('touch:dragdrag', { physics: this.physics });
        }

        if (PhysicalAnalyzers.isPinch(this.physics)) {
            switch (PhysicalAnalyzers.getPinchDirection(this.physics)) {
                case 'in':
                    this.trigger('touch:pinch', { physics: this.physics });
                    break;
                case 'out':
                    this.trigger('touch:spread', { physics: this.physics });
                    break;
                default:
                    throw `Invalid pinch direction: ${direction}`;
            }
        }
    }

    touchEndHandler(touchEvent) {
        console.log('touchEndHandler', touchEvent);
        const physical = this.physics;
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
            console.log('xxx:timeDiff', timeDiff);

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
                console.log(`xxx:velocity`, {
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
    static isDragDrag(physics, options) {
        // return true if there are two physical elements both traveling in the same direction within d degrees of each other
        if (physics.length !== 2) return false;
        let { degrees, speed, minSpeed } = options || {};
        degrees = degrees || 30; // degrees
        speed = speed || 100; // pixels per second
        minSpeed = minSpeed || 200;

        const [t1, t2] = physics;

        if (t1.speed < minSpeed) {
            console.log('xxx:dragdrag', `speed too slow: ${t1.speed}`);
            return false;
        }

        if (t2.speed < minSpeed) {
            console.log('xxx:dragdrag', `speed too slow: ${t2.speed}`);
            return false;
        }

        const angleDiff = Math.abs(t1.degree - t2.degree);
        const speedDiff = Math.abs(t1.speed - t2.speed);

        if (angleDiff > degrees) {
            console.log(
                'xxx:dragdrag',
                `angle different too great: ${angleDiff}`,
            );
            return false;
        }
        if (speedDiff > speed) {
            console.log(
                'xxx:dragdrag',
                `speed different too great: ${speedDiff}`,
            );
            return false;
        }

        console.log(
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
                console.log(
                    'xxx:pinchorspread',
                    `speed 1 too slow: ${t1.speed}`,
                    physics,
                );
            }

            if (t2.speed < minSpeed) {
                console.log(
                    'xxx:pinchorspread',
                    `speed 2 too slow: ${t2.speed}`,
                    physics,
                );
            }

            return false;
        }

        const degreeDiff = 180 - Math.abs(t1.degree - t2.degree);

        if (degreeDiff > degrees) {
            console.log(
                `xxx:pinchorspread`,
                `not moving opposite enough: d1: ${t1.degree}, d2: ${t2.degree}, diff: ${degreeDiff}, threshold: ${degrees}`,
            );
            return false;
        }

        console.log(
            'xxx:pinchorspread',
            `${t1.degree}~|${t2.degree}, ${t1.speed}~=${t2.speed}`,
        );

        return true;
    }

    static getPinchDirection(physics, options) {
        if (!PhysicalAnalyzers.isPinch(physics, options)) return false;

        const [t1, t2] = physics;
        const [v1, v2] = [t1.velocity, t2.velocity];

        const distanceNow = Math.sqrt(
            (t1.position.x - t2.position.x) ** 2 +
                (t1.position.y - t2.position.y) ** 2,
        );

        const distanceLater = Math.sqrt(
            (t1.position.x + v1.x - t2.position.x - v2.x) ** 2 +
                (t1.position.y + v1.y - t2.position.y - v2.y) ** 2,
        );

        const distanceDiff = distanceLater - distanceNow;
        const direction = distanceDiff > 0 ? 'out' : 'in';
        console.log('xxx:pinchorspread', direction, {
            distanceLater,
            distanceNow,
        });

        return direction;
    }
}

function positiveDegree(v) {
    return (v + 360) % 360;
}
