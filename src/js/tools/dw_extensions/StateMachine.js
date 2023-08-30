import { EventManager } from './EventManager.js';
import { computeKeyboardState } from './computeKeyboardState.js';
import { computeMouseState } from './computeMouseState.js';
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

    this.keysThatAreDown = new Set();

    this.events.on('keydown', (keyboardEvent) => {
      // keep track of what keys are down but not up
      this.keysThatAreDown.add(keyboardEvent.key);
    });

    this.events.on('keyup', (keyboardEvent) => {
      this.keysThatAreDown.delete(keyboardEvent.key);
    });

    this.events.on('keydown', (keyboardEvent) => {
      this.keyboardEvent = keyboardEvent;
      const keyboardState = computeKeyboardState(keyboardEvent, this.keysThatAreDown);
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
