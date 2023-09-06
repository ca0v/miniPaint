import { EventManager } from './EventManager.js';

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
            this.trigger('touch:add', touchEvent);
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

        this.trigger('touch:begin', touchEvent);
    }

    touchCancelHandler(touchEvent) {
        console.log('touchCancelHandler', touchEvent);
        this.abort();
    }

    touchMoveHandler(touchEvent) {
        console.log('touchMoveHandler', touchEvent);
        // if user adds a finger while moving, trigger a synthetic touchstart
        if (this.physics.length < touchEvent.touches.length) {
            this.trigger('touch:add', touchEvent);
        } else if (this.physics.length > touchEvent.touches.length) {
            this.trigger('touch:remove', touchEvent);
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
            this.trigger('touch:dragdrag', touchEvent);
        }
        if (PhysicalAnalyzers.isPinchOrSpread(this.physics)) {
            this.trigger('touch:pinchorspread', touchEvent);
        }
    }

    touchEndHandler(touchEvent) {
        console.log('touchEndHandler', touchEvent);
        if (touchEvent.touches.length === 0) {
            this.complete();
            this.trigger('touch:complete', touchEvent);
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

            const position = { x: t.clientX, y: t.clientY };
            const velocity = {
                x: timeDiff
                    ? (1000 * (position.x - prior.position.x)) / timeDiff
                    : 0,
                y: timeDiff
                    ? (1000 * (position.y - prior.position.y)) / timeDiff
                    : 0,
            };
            const acceleration = {
                x: timeDiff
                    ? (1000 * (velocity.x - prior.velocity.x)) / timeDiff
                    : 0,
                y: timeDiff
                    ? (1000 * (velocity.y - prior.velocity.y)) / timeDiff
                    : 0,
            };
            const angle = Math.atan2(velocity.y, velocity.x);
            if (Number.isNaN(angle)) {
                debugger;
            }

            const speed = Math.sqrt(
                velocity.x * velocity.x + velocity.y * velocity.y,
            );

            return {
                time: Date.now(),
                start: prior.start,
                position,
                velocity,
                acceleration,
                degree: (angle * 180) / Math.PI,
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

        if (Number.isNaN(t1.degree) || Number.isNaN(t2.degree)) {
            console.log('xxx', `degree is NaN: ${t1.degree}, ${t2.degree}`);
            return false;
        }

        if (Number.isNaN(t1.speed) || Number.isNaN(t2.speed)) {
            console.log('xxx', `speed is NaN: ${t1.speed}, ${t2.speed}`);
            return false;
        }

        if (t1.speed < minSpeed) {
            console.log('xxx', `speed too slow: ${t1.speed}`);
            return false;
        }

        if (t2.speed < minSpeed) {
            console.log('xxx', `speed too slow: ${t2.speed}`);
            return false;
        }

        const angleDiff = Math.abs(t1.degree - t2.degree);
        const speedDiff = Math.abs(t1.speed - t2.speed);

        if (angleDiff > degrees) {
            console.log('xxx', `angle different too great: ${angleDiff}`);
            return false;
        }
        if (speedDiff > speed) {
            console.log('xxx', `speed different too great: ${speedDiff}`);
            return false;
        }

        console.log(
            'xxx',
            `dragdrag: ${t1.degree}~=${t2.degree}, ${t1.speed}~=${t2.speed}`,
        );
        return true;
    }

    static isPinchOrSpread(physics, options) {
        // return true if the two physical elements are moving in opposite directions
        if (physics.length !== 2) return false;
        let { degrees, speed, minSpeed } = options || {};
        degrees = degrees || 30; // degrees
        speed = speed || 100; // pixels per second
        minSpeed = minSpeed || 50;

        const [t1, t2] = physics;

        if (Number.isNaN(t1.degree) || Number.isNaN(t2.degree)) {
            console.log(
                'xxx:pinchorspread',
                `degree is NaN: ${t1.degree}, ${t2.degree}`,
            );
            return false;
        }

        if (Number.isNaN(t1.speed) || Number.isNaN(t2.speed)) {
            console.log(
                'xxx:pinchorspread',
                `speed is NaN: ${t1.speed}, ${t2.speed}`,
            );
            return false;
        }

        if (t1.speed < minSpeed) {
            console.log('xxx:pinchorspread', `speed too slow: ${t1.speed}`);
            return false;
        }

        if (t2.speed < minSpeed) {
            console.log('xxx:pinchorspread', `speed too slow: ${t2.speed}`);
            return false;
        }

        const angleDiff = Math.abs(t1.degree - t2.degree);
        const speedDiff = Math.abs(t1.speed - t2.speed);

        if (angleDiff < degrees) {
            console.log(
                'xxx:pinchorspread',
                `angle different too small: ${angleDiff}`,
            );
            return false;
        }

        if (speedDiff > speed) {
            console.log(
                'xxx:pinchorspread',
                `speed different too great: ${speedDiff}`,
            );
            return false;
        }

        // moving towards each other?

        console.log(
            'xxx:pinchorspread',
            `${t1.degree}~=${t2.degree}, ${t1.speed}~=${t2.speed}`,
        );

        return true;
    }
}
