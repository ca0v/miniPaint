/*
 TODO:
 -  extract the touch events into a separate class
 */

import { EventManager } from './EventManager.js';
import { StateMachineContext } from './StateMachineContext.js';
import { TouchEventGenerator } from './TouchEventGenerator.js';
import { computeKeyboardState } from './computeKeyboardState.js';
import { computeMouseState } from './computeMouseState.js';
import { distance, average, sum } from './distance.js';
import { isShortcutMatch } from './isShortcutMatch.js';
import { verbose } from './log.js';

const MINIMAL_SPREAD_DISTANCE = 5;

const touchEventGenerator = new TouchEventGenerator();
'start,end,:begin,:drag,:complete,:add,:remove,:dragdrag,:pinch,:spread'
    .split(',')
    .forEach((topic) =>
        touchEventGenerator.on(`touch${topic}`, (e) =>
            verbose(`touch${topic}`, e),
        ),
    );

export class StateMachine {
    constructor(states, scopeElement = document.body) {
        if (!states.length) throw 'You must provide at least one state';

        this.states = {};
        states.forEach((s) => (this.states[s] = s));

        this.contexts = [];
        this.actions = {};

        this.events = new EventManager(scopeElement);

        const mouseDownState = {
            buttons: 0,
        };

        const keysThatAreDown = new Set();

        this.events.on('mousemove', (mouseEvent) => {
            const mouseState = computeMouseState(mouseEvent, keysThatAreDown);
            const preventBubble =
                false !== this.trigger(mouseState, mouseEvent);
            if (preventBubble) {
                mouseEvent.preventDefault(); // prevent default behavior
                mouseEvent.stopPropagation(); // handlers on parent elements will not be called
                mouseEvent.stopImmediatePropagation(); // handlers on this same element will not be called
            }
        });

        this.events.on('mousedown', (mouseEvent) => {
            mouseDownState.buttons = mouseEvent.buttons;
            const mouseState = computeMouseState(mouseEvent, keysThatAreDown);

            // break on right-click
            if (mouseEvent.buttons === 2) {
                console.log('Right click');
            }

            const preventBubble =
                false !== this.trigger(mouseState, mouseEvent);
            if (preventBubble) {
                mouseEvent.preventDefault(); // prevent default behavior
                mouseEvent.stopPropagation(); // handlers on parent elements will not be called
                mouseEvent.stopImmediatePropagation(); // handlers on this same element will not be called
            }
        });

        this.events.on('mouseup', (mouseEvent) => {
            const priorButtons = mouseDownState.buttons;
            let mouseState = computeMouseState(mouseEvent, keysThatAreDown);
            if (priorButtons === 1) mouseState = `Left+${mouseState}`;
            if (priorButtons === 2) mouseState = `Right+${mouseState}`;
            const preventBubble =
                false !== this.trigger(mouseState, mouseEvent);
            if (preventBubble) {
                mouseEvent.preventDefault(); // prevent default behavior
                mouseEvent.stopPropagation(); // handlers on parent elements will not be called
                mouseEvent.stopImmediatePropagation(); // handlers on this same element will not be called
            }
        });

        // forward touch events through state events to honor "off" status
        // when statemachine is off() the listener will not receive these events
        'touch:begin,touch:drag,touch:complete,touch:abort,touch:add,touch:remove'
            .split(',')
            .forEach((topic) => {
                touchEventGenerator.on(topic, (e) => {
                    verbose(topic);
                    this.events.trigger(topic, e);
                });
            });

        touchEventGenerator.on('touch:begin', (e) => {
            this.lastPinchSpreadLocation = null;
            this.lastDragDragLocation = null;
        });

        // is the user touching the screen in two locations?
        touchEventGenerator.on('touch:dragdrag', (e) => {
            const currentLocation = e.physics[0].position;

            if (!this.lastDragDragLocation) {
                this.lastDragDragLocation = currentLocation;
                verbose('DragDrag started', currentLocation);
                return;
            }

            const distanceTraveled = distance(
                currentLocation,
                this.lastDragDragLocation,
            );

            if (distanceTraveled < MINIMAL_SPREAD_DISTANCE) {
                verbose(`Drag too small: ${distanceTraveled}`);
                return;
            }

            const degree = e.physics[0].degree;
            this.lastDragDragLocation = currentLocation;

            this.events.trigger(`touch:dragdrag`, {
                dragDirectionInDegrees: degree,
                dragDistanceInPixels: distanceTraveled,
            });
        });

        touchEventGenerator.on('touch:pinch', (e) => {
            const currentLocation = e.physics.map((p) => p.position);

            if (!this.lastPinchSpreadLocation) {
                this.lastPinchSpreadLocation = currentLocation;
                verbose('Pinch started', currentLocation);
                return;
            }

            const distanceTraveled = average(
                currentLocation.map((c, i) =>
                    distance(c, this.lastPinchSpreadLocation[i]),
                ),
            );

            if (distanceTraveled < MINIMAL_SPREAD_DISTANCE) {
                verbose(`Pinch too small: ${distanceTraveled}`);
                return;
            }

            this.lastPinchSpreadLocation = currentLocation;
            this.events.trigger('touch:pinch', {
                physics: e.physics,
                dragDistanceInPixels: distanceTraveled,
            });
        });

        touchEventGenerator.on('touch:spread', (e) => {
            const currentLocation = e.physics.map((p) => p.position);

            if (!this.lastPinchSpreadLocation) {
                this.lastPinchSpreadLocation = currentLocation;
                console.log('Spread started', currentLocation);
                return;
            }

            const distanceTraveled = sum(
                currentLocation.map((c, i) =>
                    distance(c, this.lastPinchSpreadLocation[i]),
                ),
            );

            if (distanceTraveled < MINIMAL_SPREAD_DISTANCE) {
                console.log(`Spread too small: ${distanceTraveled}`);
                return;
            }

            this.lastPinchSpreadLocation = currentLocation;
            this.events.trigger('touch:spread', {
                physics: e.physics,
                dragDistanceInPixels: distanceTraveled,
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
        return this.events.on(eventName, callback);
    }

    setCurrentState(state) {
        if (!this.states[state]) throw `State ${state} is not a valid state`;
        if (state === this.currentState) return;
        verbose(`State changing from ${this.currentState} to ${state}`);
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
