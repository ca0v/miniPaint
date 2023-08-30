import { EventManager } from './EventManager.js';
import { computeKeyboardState } from './computeKeyboardState.js';
import { computeMouseState } from './computeMouseState.js';
import { distance } from './distance.js';
import { isShortcutMatch } from './isShortcutMatch.js';
import { log } from './log.js';

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

    this.mouseEvent = null;
    this.keyboardEvent = null;

    this.events = new EventManager();

    this.events.on('mousemove', (mouseEvent) => {
      this.mouseEvent = mouseEvent;
      const mouseState = computeMouseState(mouseEvent);
      const preventBubble = false !== this.execute(mouseState);
      if (preventBubble) mouseEvent.preventDefault();
    });

    this.events.on('mousedown', (mouseEvent) => {
      this.mouseEvent = mouseEvent;
      const mouseState = computeMouseState(mouseEvent);
      const preventBubble = false !== this.execute(mouseState);
      if (preventBubble) mouseEvent.preventDefault();
    });

    this.events.on('mouseup', (mouseEvent) => {
      const priorButtons = this.mouseEvent.buttons;
      this.mouseEvent = mouseEvent;
      let mouseState = computeMouseState(mouseEvent);
      if (priorButtons === 1) mouseState = `Left+${mouseState}`;
      if (priorButtons === 2) mouseState = `Right+${mouseState}`;
      const preventBubble = false !== this.execute(mouseState);
      if (preventBubble) mouseEvent.preventDefault();
    });

    // did user touch the screen?
    this.events.on('touchstart', (touchEvent) => {
      if (touchEvent.touches[1]) return; // ignore multi-touch
      this.mouseEvent = touchEvent;
      const mouseState = computeMouseState(touchEvent);
      const preventBubble = false !== this.execute(mouseState);
      if (preventBubble) touchEvent.preventDefault();
    });

    // did user move their finger on the screen?
    this.events.on('touchmove', (touchEvent) => {
      if (touchEvent.touches[1]) return; // ignore multi-touch
      this.mouseEvent = touchEvent;
      const mouseState = computeMouseState(touchEvent);
      const preventBubble = false !== this.execute(mouseState);
      if (preventBubble) touchEvent.preventDefault();
    });

    // did user lift their finger off the screen?
    this.events.on('touchend', (touchEvent) => {
      if (touchEvent.touches[1]) return; // ignore multi-touch
      this.mouseEvent = touchEvent;
      const mouseState = computeMouseState(touchEvent);
      const preventBubble = false !== this.execute(mouseState);
      if (preventBubble) touchEvent.preventDefault();
    });

    // is the user touching the screen in two locations?
    {
      const touchStatus = {
        zoomDirection: null,
      };
      this.events.on('touchend', (touchEvent) => {
        touchStatus.priorTouch1 = null;
        touchStatus.priorTouch2 = null;
        touchStatus.zoomDirection = null;
      });

      this.events.on('touchmove', (touchEvent) => {
        if (!touchEvent.touches[1]) return; // ignore single-touch

        const touch1 = touchEvent.touches[0];
        const touch2 = touchEvent.touches[1];

        if (!touchStatus.priorTouch1) touchStatus.priorTouch1 = { x: touch1.clientX, y: touch1.clientY };
        if (!touchStatus.priorTouch2) touchStatus.priorTouch2 = { x: touch2.clientX, y: touch2.clientY };

        // are we zooming in or out?
        const priorDistance = distance(touchStatus.priorTouch1, touchStatus.priorTouch2);
        const currentDistance = distance(
          { x: touch1.clientX, y: touch1.clientY },
          { x: touch2.clientX, y: touch2.clientY },
        );

        const totalDistance = Math.abs(currentDistance - priorDistance);
        if (totalDistance > 10) {
          touchStatus.priorTouch1 = { x: touch1.clientX, y: touch1.clientY };
          touchStatus.priorTouch2 = { x: touch2.clientX, y: touch2.clientY };
          const zoomDirection = currentDistance > priorDistance ? 'ZoomIn' : 'ZoomOut';
          this.execute(zoomDirection);
          if (touchStatus.zoomDirection !== zoomDirection) {
            // this is a hack for computing the point to zoom about and that is not working well
            this.mouseEvent = touchEvent;
            touchStatus.zoomDirection = zoomDirection;
            console.log(`Zooming ${zoomDirection}`);
          }
        }
      });
    }

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
      const preventBubble = false !== this.execute(keyboardState);
      if (preventBubble) keyboardEvent.preventDefault();
    });
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

  execute(when) {
    const targetEvents = this.contexts
      .filter((e) => e.from.includes(this.currentState))
      .filter((e) => !e.when || e.when.some((v) => isShortcutMatch(v, when)));
    if (!targetEvents.length) return false;
    let stateChanged = false;
    return targetEvents.some((targetEvent) => {
      if (targetEvent.do) {
        if (false === targetEvent.do.call(this)) return false;
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

  trigger(event) {
    const success = false !== this.execute(event);
    if (!success) log(`No handler found for event ${event}, state ${this.currentState}`);
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
