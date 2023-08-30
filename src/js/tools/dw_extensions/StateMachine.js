import { EventManager } from './EventManager.js';
import { computeKeyboardState } from './computeKeyboardState.js';
import { computeMouseState } from './computeMouseState.js';
import { distance } from './distance.js';
import { isShortcutMatch } from './isShortcutMatch.js';
import { log } from './log.js';

const MINIMAL_SPREAD_DISTANCE = 25;

/**
 * The ideal would be to make state changes intuitive and easy to modify.  For example, shift+click closes the polygon as does [Space].  The [Space] is sort of intuitive because
 * it is associated with a state called "ClosePolygon" but it would be better if it were part of a state diagram, for example:
 *
  const s = new StateMachine("Magic Crop Tool");

  // register the event handlers
  s.register({
    placePointAtClickLocation: () => {
    },
    movePointLeft10Units: () => {
    },
    closePolygon: () => {
    },
    placePointAtCenterOfCanvas: () => {
    },
  })

  // register the events to be handled
  s.from(s.states.drawing).goto(s.states.editing).when(s.mouseState("Shift+Click")).do(s.actions.placePointAtClickLocation);
  s.from(s.states.editing).goto(s.state.editing).when(s.keyboardState(s => s === "Ctrl+Shift+ArrowLeft")).do(s.actions.movePointLeft10Units);
  s.from(s.states.placing).goto(s.states.editing).when(s.keyboardState(" ")).do(s.actions.closePolygon);
  s.from(s.states.ready).goto(s.states.drawing).when(s.mouseState("Shift+Click")).do(s.actions.placePointAtCenterOfCanvas);

 */

export class StateMachine {
  constructor(states) {
    if (!states.length) throw 'You must provide at least one state';

    this.states = {};
    states.forEach((s) => (this.states[s] = s));

    this.contexts = [];
    this.actions = {};

    this.keyboardEvent = null;

    this.events = new EventManager();

    const mouseDownState = {
      buttons: 0,
    };

    this.events.on('mousemove', (mouseEvent) => {
      const mouseState = computeMouseState(mouseEvent);
      const preventBubble = false !== this.trigger(mouseState, { e: mouseEvent });
      if (preventBubble) mouseEvent.preventDefault();
    });

    this.events.on('mousedown', (mouseEvent) => {
      mouseDownState.buttons = mouseEvent.buttons;
      const mouseState = computeMouseState(mouseEvent);
      const preventBubble = false !== this.trigger(mouseState, { e: mouseEvent });
      if (preventBubble) mouseEvent.preventDefault();
    });

    this.events.on('mouseup', (mouseEvent) => {
      const priorButtons = mouseDownState.buttons;
      let mouseState = computeMouseState(mouseEvent);
      if (priorButtons === 1) mouseState = `Left+${mouseState}`;
      if (priorButtons === 2) mouseState = `Right+${mouseState}`;
      const preventBubble = false !== this.trigger(mouseState, { e: mouseEvent });
      if (preventBubble) mouseEvent.preventDefault();
    });

    // did user touch the screen?
    this.events.on('touchstart', (touchEvent) => {
      if (touchEvent.touches[1]) return; // ignore multi-touch
      const mouseState = computeMouseState(touchEvent);
      const preventBubble = false !== this.trigger(mouseState, { e: touchEvent });
      if (preventBubble) touchEvent.preventDefault();
    });

    // did user move their finger on the screen?
    this.events.on('touchmove', (touchEvent) => {
      if (touchEvent.touches[1]) return; // ignore multi-touch
      const mouseState = computeMouseState(touchEvent);
      const preventBubble = false !== this.trigger(mouseState, { e: touchEvent });
      if (preventBubble) touchEvent.preventDefault();
    });

    // did user lift their finger off the screen?
    this.events.on('touchend', (touchEvent) => {
      if (touchEvent.touches[1]) return; // ignore multi-touch
      const mouseState = computeMouseState(touchEvent);
      const preventBubble = false !== this.trigger(mouseState, { e: touchEvent });
      if (preventBubble) touchEvent.preventDefault();
    });

    // is the user touching the screen in two locations?
    this.events.on('touchstart', (touchStartEvent) => {
      if (touchStartEvent.touches.length !== 2) return;

      const touchCount = touchStartEvent.touches.length;
      console.log(`touchstart: ${touchCount}`);

      const touchEvents = new EventManager();

      const touchState = {};

      touchEvents.on('touchend', (touchEvent) => {
        if (touchEvent.touches.length !== touchCount - 1) return;
        console.log(`touchend: ${touchEvent.touches.length}`);
        touchEvents.off();
      });

      touchEvents.on('touchmove', (touchEvent) => {
        if (touchEvent.touches.length !== touchCount) return;
        console.log(`touchmove: ${touchEvent.touches.length}`);

        {
          const touch1 = touchLocation(touchEvent.touches[0]);
          const touch2 = touchLocation(touchEvent.touches[1]);

          if (!touchState.pinch) {
            touchState.pinch = { touch1, touch2 };
          }

          {
            // is this a Press+Drag
            const delta1 = distance(touchState.pinch.touch1, touch1);
            const delta2 = distance(touchState.pinch.touch2, touch2);
            if (delta1 < MINIMAL_SPREAD_DISTANCE && delta2 > MINIMAL_SPREAD_DISTANCE) {
              {
                // to be moved outside this control
                // what is the direction of the drag?
                const dx = touch2.x - touchState.pinch.touch2.x;
                const dy = touch2.y - touchState.pinch.touch2.y;
                const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;

                const draggingUp = closeTo(degrees, -90);
                const draggingDown = closeTo(degrees, 90);
                const draggingLeft = closeTo(degrees, 180);
                const draggingRight = closeTo(degrees, 0);

                draggingUp && this.trigger('PressDragUp');
                draggingDown && this.trigger('PressDragDown');
                draggingLeft && this.trigger('PressDragLeft');
                draggingRight && this.trigger('PressDragRight');

                if (draggingUp || draggingDown || draggingLeft || draggingRight) {
                  touchState.pinch.touch2 = touch2;
                }
              }
              return;
            }
          }

          {
            // is this a pinch or spread?
            const delta1 = distance(touchState.pinch.touch1, touch1);
            const delta2 = distance(touchState.pinch.touch2, touch2);
            if (delta1 > MINIMAL_SPREAD_DISTANCE && delta2 > MINIMAL_SPREAD_DISTANCE) {
              const startDistance = distance(touchState.pinch.touch1, touchState.pinch.touch2);
              const currentDistance = distance(touch1, touch2);
              const delta = currentDistance - startDistance;
              if (Math.abs(delta) > MINIMAL_SPREAD_DISTANCE) {
                touchState.pinch = { touch1, touch2 };
                const pinchDirection = delta > 0 ? 'Spread' : 'Pinch';
                this.trigger(pinchDirection);
                return;
              }
            }
          }
        }
      });
    });

    {
      const keysThatAreDown = new Set();

      this.events.on('keydown', (keyboardEvent) => {
        // keep track of what keys are down but not up
        keysThatAreDown.add(keyboardEvent.key);
      });

      this.events.on('keyup', (keyboardEvent) => {
        keysThatAreDown.delete(keyboardEvent.key);
      });

      this.events.on('keydown', (keyboardEvent) => {
        this.keyboardEvent = keyboardEvent;
        const keyboardState = computeKeyboardState(keyboardEvent, keysThatAreDown);
        const preventBubble = false !== this.trigger(keyboardState);
        if (preventBubble) keyboardEvent.preventDefault();
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
      .filter((e) => !e.when || e.when.some((v) => isShortcutMatch(v, eventName)));
    if (!targetEvents.length) return false;
    let stateChanged = false;
    return targetEvents.some((targetEvent) => {
      if (targetEvent.do) {
        if (false === targetEvent.do.call(this, eventData)) return false;
        this.events.trigger('execute', targetEvent);
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
  }

  trigger(eventName, eventData) {
    const success = false !== this.execute(eventName, eventData);
    if (!success) log(`No handler found for event ${eventName}, state ${this.currentState}`);
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
    return new ContextOperands(this, context);
  }
}

class ContextOperands {
  // adds goto, when, do, about, from methods to the context
  constructor(state, context) {
    this.state = state;
    this.context = context;
  }

  goto(newState) {
    this.context.goto = newState;
    return this;
  }

  when(condition) {
    if (typeof condition === 'string') condition = [condition];
    this.context.when = condition;
    return this;
  }

  do(action) {
    // if action is not a value of events, throw
    if (!Object.values(this.state.actions).includes(action))
      throw `Action not found in actions: ${Object.keys(this.state.actions).join(', ')}, action: ${action?.toString()}`;
    this.context.do = action;
    return this;
  }

  about(about) {
    this.context.about = about;
    return this;
  }

  from(state) {
    if (typeof state === 'string') state = [state];

    state.forEach((s) => {
      if (!this.state.states[s]) throw `State ${s} is not a valid state`;
    });

    this.context.from = state;
    return this;
  }
}
function touchLocation(touch) {
  return { x: touch.clientX, y: touch.clientY };
}

function closeTo(expected, actual, tolerance = 45) {
  return Math.abs(expected - actual) < tolerance;
}
