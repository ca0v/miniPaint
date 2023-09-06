/*
 TODO:
 -  extract the touch events into a separate class
 */

import { EventManager } from './EventManager.js';
import { StateMachineContext } from './StateMachineContext.js';
import { computeKeyboardState } from './computeKeyboardState.js';
import { computeMouseState } from './computeMouseState.js';
import { distance } from './distance.js';
import { isShortcutMatch } from './isShortcutMatch.js';
import { verbose } from './log.js';

const MINIMAL_SPREAD_DISTANCE = 25;

export class StateMachine {
    constructor(states) {
        if (!states.length) throw 'You must provide at least one state';

        this.states = {};
        states.forEach((s) => (this.states[s] = s));

        this.contexts = [];
        this.actions = {};

        this.events = new EventManager(document.body);

        const mouseDownState = {
            buttons: 0,
        };

        const keysThatAreDown = new Set();

        this.events.on('mousemove', (mouseEvent) => {
            const mouseState = computeMouseState(mouseEvent, keysThatAreDown);
            const preventBubble =
                false !== this.trigger(mouseState, mouseEvent);
            if (preventBubble) mouseEvent.preventDefault();
        });

        this.events.on('mousedown', (mouseEvent) => {
            mouseDownState.buttons = mouseEvent.buttons;
            const mouseState = computeMouseState(mouseEvent, keysThatAreDown);
            const preventBubble =
                false !== this.trigger(mouseState, mouseEvent);
            if (preventBubble) mouseEvent.preventDefault();
        });

        this.events.on('mouseup', (mouseEvent) => {
            const priorButtons = mouseDownState.buttons;
            let mouseState = computeMouseState(mouseEvent, keysThatAreDown);
            if (priorButtons === 1) mouseState = `Left+${mouseState}`;
            if (priorButtons === 2) mouseState = `Right+${mouseState}`;
            const preventBubble =
                false !== this.trigger(mouseState, mouseEvent);
            if (preventBubble) mouseEvent.preventDefault();
        });

        // did user touch the screen?
        this.events.on('touchstart', (touchEvent) => {
            if (touchEvent.touches[1]) return; // ignore multi-touch
            const mouseState = computeMouseState(touchEvent);
            const preventBubble =
                false !== this.trigger(mouseState, touchEvent);
            if (preventBubble) touchEvent.preventDefault();
        });

        // did user move their finger on the screen?
        this.events.on('touchmove', (touchEvent) => {
            if (touchEvent.touches[1]) return; // ignore multi-touch
            const mouseState = computeMouseState(touchEvent);
            const preventBubble =
                false !== this.trigger(mouseState, touchEvent);
            if (preventBubble) touchEvent.preventDefault();
        });

        // did user lift their finger off the screen?
        this.events.on('touchend', (touchEvent) => {
            if (touchEvent.touches[1]) return; // ignore multi-touch
            const mouseState = computeMouseState(touchEvent);
            const preventBubble =
                false !== this.trigger(mouseState, touchEvent);
            if (preventBubble) touchEvent.preventDefault();
        });

        // is the user touching the screen in two locations?
        this.events.on('touchstart', (touchStartEvent) => {
            if (touchStartEvent.touches.length !== 2) return;

            const touchCount = touchStartEvent.touches.length;

            const touchEvents = new EventManager();

            const touchState = {};

            touchEvents.on('touchend', (touchEvent) => {
                if (touchEvent.touches.length !== touchCount - 1) return;
                touchEvents.off();
            });

            touchEvents.on('touchmove', (touchEvent) => {
                if (touchEvent.touches.length !== touchCount) return;

                {
                    const touch1 = touchLocation(touchEvent.touches[0]);
                    const touch2 = touchLocation(touchEvent.touches[1]);

                    if (!touchState.pinch) {
                        touchState.pinch = { touch1, touch2 };
                    }

                    {
                        // is this a Drag+Drag (are both fingers moving in the same direction?)
                        const delta1 = distance(
                            touchState.pinch.touch1,
                            touch1,
                        );
                        const delta2 = distance(
                            touchState.pinch.touch2,
                            touch2,
                        );
                        const angle1 = angleOf(touch1, touchState.pinch.touch1);
                        const angle2 = angleOf(touch2, touchState.pinch.touch2);
                        if (
                            delta1 > MINIMAL_SPREAD_DISTANCE &&
                            delta2 > MINIMAL_SPREAD_DISTANCE &&
                            closeTo(delta1, delta2, 50) &&
                            closeTo(angle1, angle2, 10)
                        ) {
                            const args = {
                                dragDistanceInPixels: (delta1 + delta2) / 2,
                                dragDirectionInDegrees: (angle1 + angle2) / 2,
                            };
                            touchState.pinch = { touch1, touch2 };
                            // listener needs to interpret this, that is why it is not a this.trigger
                            this.events.trigger('DragDrag', args);
                            return;
                        }
                    }
                    {
                        // is this a Press+Drag
                        const delta1 = distance(
                            touchState.pinch.touch1,
                            touch1,
                        );
                        const delta2 = distance(
                            touchState.pinch.touch2,
                            touch2,
                        );
                        if (
                            delta1 < MINIMAL_SPREAD_DISTANCE &&
                            delta2 > MINIMAL_SPREAD_DISTANCE
                        ) {
                            // to be moved outside this control
                            // what is the direction of the drag?
                            const degrees = angleOf(
                                touch2,
                                touchState.pinch.touch2,
                            );

                            const args = {
                                dragDistanceInPixels: delta2,
                                dragDirectionInDegrees: degrees,
                            };

                            // listener needs to interpret this, that is why it is not a this.trigger
                            touchState.pinch.touch2 = touch2;
                            this.events.trigger('PressDrag', args);
                            return;
                        }
                    }

                    {
                        // is this a pinch or spread?
                        const delta1 = distance(
                            touchState.pinch.touch1,
                            touch1,
                        );
                        const delta2 = distance(
                            touchState.pinch.touch2,
                            touch2,
                        );
                        const angle1 = angleOf(touch1, touchState.pinch.touch1);
                        const angle2 = angleOf(touch2, touchState.pinch.touch2);

                        if (
                            delta1 > MINIMAL_SPREAD_DISTANCE &&
                            delta2 > MINIMAL_SPREAD_DISTANCE &&
                            closeTo(Math.abs(angle1 - angle2), 180, 30)
                        ) {
                            const startDistance = distance(
                                touchState.pinch.touch1,
                                touchState.pinch.touch2,
                            );
                            const currentDistance = distance(touch1, touch2);
                            const delta = currentDistance - startDistance;
                            if (Math.abs(delta) > MINIMAL_SPREAD_DISTANCE) {
                                touchState.pinch = { touch1, touch2 };
                                const args = {
                                    currentDistanceInPixels: currentDistance,
                                    priorDistanceInPixels: delta,
                                    dragDistanceInPixels: (delta1 + delta2) / 2,
                                    dragDirectionInDegrees: angleOf(
                                        touch2,
                                        touch1,
                                    ),
                                    touches: [touch1, touch2],
                                };

                                const pinchDirection =
                                    delta > 0 ? 'Spread' : 'Pinch';

                                this.events.trigger(pinchDirection, args);
                                return;
                            }
                        }
                    }
                }
            });
        });

        {
            this.events.on('keydown', (keyboardEvent) => {
                // keep track of what keys are down but not up
                keysThatAreDown.add(keyboardEvent.key);
            });

            this.events.on('keyup', (keyboardEvent) => {
                keysThatAreDown.delete(keyboardEvent.key);
                // if meta key is up, clear all keysThatAreDown
                if (keyboardEvent.key === 'Meta') keysThatAreDown.clear();
                // keyup events are not firing for the individual keys
            });

            this.events.on('keydown', (event) => {
                const keyboardState = computeKeyboardState(
                    event,
                    keysThatAreDown,
                );
                const preventBubble =
                    false !== this.trigger(keyboardState, event);

                if (preventBubble) {
                    verbose(`Preventing bubble for ${keyboardState}`);
                    event.preventDefault(); // prevent default behavior
                    event.stopPropagation(); // handlers on parent elements will not be called
                    event.stopImmediatePropagation(); // handlers on this same element will not be called
                }
            });

            // if we lose focus, clear the keysThatAreDown
            this.events.on('blur', () => {
                keysThatAreDown.clear();
            });
        }
    }

    off() {
        this.events.off();
    }

    on(eventName, callback) {
        this.events.on(eventName, callback);
    }

    setCurrentState(state) {
        if (!this.states[state]) throw `State ${state} is not a valid state`;
        if (state === this.currentState) return;
        this.currentState = state;
        this.execute();
        this.events.trigger('stateChanged', this.currentState);
    }

    execute(eventName, eventData) {
        const targetEvents = this.contexts
            .filter((e) => e.from.includes(this.currentState))
            .filter(
                (e) =>
                    !e.when ||
                    e.when.some((v) => isShortcutMatch(v, eventName)),
            );
        if (!targetEvents.length) return false;
        let stateChanged = false;
        let handled = false;
        targetEvents.forEach((targetEvent) => {
            if (targetEvent.do) {
                if (false === targetEvent.do.call(this, eventData)) return;
                this.events.trigger('execute', targetEvent);
                handled = true;
                if (stateChanged)
                    throw new Error(
                        `A handler already exists for state ${targetEvent.from} and event ${targetEvent.when} so this do statement should have returned false`,
                    );
            }
            if (targetEvent.goto) {
                stateChanged = this.currentState !== targetEvent.goto;
                this.setCurrentState(targetEvent.goto);
            }
            return true;
        });

        return handled;
    }

    trigger(eventName, eventData) {
        const success = false !== this.execute(eventName, eventData);
        if (!success)
            verbose(
                `No handler found for event ${eventName}, state ${this.currentState}`,
            );
        return success;
    }

    register(actions) {
        // mixin the actions into this.actions
        Object.assign(this.actions, actions);
    }

    about(about) {
        const context = {
            about,
        };

        this.contexts.push(context);
        return new StateMachineContext(this, context);
    }
}

class TouchEventGenerator {
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

    touchStartHandler(touchEvent) {
        // if already handling a touch, abort it
        if (this.touchHandle) {
            this.touchHandle.abort();
            console.log('aborting prior touch');
        }

        // capture the location of the touch
        this.physics = touchEvent.touches.map((t) => this.computePhysics(t));

        // listen for a touchmove and touchend
        const h1 = this.on('touchmove', this.touchMoveHandler);
        const h2 = this.on('touchend', this.touchEndHandler);
        const h3 = this.on('touchcancel', this.touchCancelHandler);

        // create a handle to abort the touch
        this.touchHandle = {
            abort: () => {
                this.touchHandle = null;
                h1.off();
                h2.off();
                h3.off();
                this.trigger('abort');
            },
        };
    }

    touchCancelHandler(touchEvent) {
        console.log('touchCancelHandler', touchEvent);
        this.touchHandle.abort();
    }

    touchMoveHandler(touchEvent) {
        console.log('touchMoveHandler', touchEvent);
        this.physics = this.computePhysics(touchEvent.touches, this.physics);
        console.log('physics', JSON.stringify(this.physics));
    }

    touchEndHandler(touchEvent) {
        console.log('touchEndHandler', touchEvent);
    }

    computePhysics(touches, priorPhysics) {
        if (!priorPhysics) {
            return touches.map((t) => ({
                start: { x: t.clientX, y: t.clientY },
                position: { x: t.clientX, y: t.clientY },
                velocity: { x: 0, y: 0 },
                acceleration: { x: 0, y: 0 },
            }));
        }

        if (touches.length !== priorPhysics.length) {
            throw new Error('Must have same number of touches');
        }

        return touches.map((t, i) => {
            const prior = priorPhysics[i];
            const position = { x: t.clientX, y: t.clientY };
            const velocity = {
                x: position.x - prior.position.x,
                y: position.y - prior.position.y,
            };
            const acceleration = {
                x: velocity.x - prior.velocity.x,
                y: velocity.y - prior.velocity.y,
            };
            return {
                start: prior.start,
                position,
                velocity,
                acceleration,
            };
        });
    }
}

new TouchEventGenerator();

function touchLocation(touch) {
    return { x: touch.clientX, y: touch.clientY };
}

function angleOf(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
}

function closeTo(expected, actual, tolerance = 0) {
    return Math.abs(expected - actual) <= tolerance;
}
