import { EventManager } from './EventManager.js';
import { computeKeyboardState } from './computeKeyboardState.js';
import { computeMouseState } from './computeMouseState.js';

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
      this.execute((e) => e.from === this.currentState && e.when === mouseState);
    });

    this.events.on('mousedown', (mouseEvent) => {
      this.mouseEvent = mouseEvent;
      const mouseState = computeMouseState(mouseEvent);
      console.log('StateMachine', 'mousedown', 'mouseState', mouseState);
      this.execute((e) => e.from === this.currentState && e.when === mouseState);
    });

    this.events.on('keydown', (keyboardEvent) => {
      this.keyboardEvent = keyboardEvent;
      const keyboardState = computeKeyboardState(keyboardEvent);
      console.log('StateMachine', 'keydown', 'keyboardState', keyboardState);
      this.execute((e) => e.from === this.currentState && e.when === keyboardState);
    });

    this.setCurrentState(states[0]);
  }

  off() {
    this.events.off();
  }

  setCurrentState(state) {
    if (!this.states[state]) throw `State ${state} is not a valid state`;
    if (state === this.currentState) return;
    console.log('StateMachine', 'setCurrentState', state);
    this.currentState = state;
    this.execute((e) => e.from === this.currentState && !e.when);
  }

  execute(filter) {
    const targetEvents = this.contexts.filter(filter);
    if (!targetEvents.length) return;
    if (targetEvents.length > 1) throw `Multiple events match state ${this.currentState}`;
    const targetEvent = targetEvents[0];
    if (targetEvent.do) {
      if (false === targetEvent.do.call(this)) return;
    }
    if (targetEvent.goto) {
      this.setCurrentState(targetEvent.goto);
    }
  }

  trigger(event) {
    const targetEvents = this.contexts.filter((e) => e.from === this.currentState && e.when === event);
    if (!targetEvents.length) return;
    if (targetEvents.length > 1) throw `Multiple events match event ${event} from state ${this.currentState}`;
    const targetEvent = targetEvents[0];
    if (targetEvent.do) {
      targetEvent.do.call(this);
    }
    if (targetEvent.goto) {
      this.setCurrentState(targetEvent.goto);
    }
  }

  register(actions) {
    // mixin the actions into this.actions
    Object.assign(this.actions, actions);
  }

  from(state) {
    if (!this.states[state]) throw `State ${state} is not a valid state`;

    const context = {
      from: state,
      goto: state,
      when: () => false,
      do: () => {},
    };

    this.contexts.push(context);

    return {
      goto: (newState) => {
        context.goto = newState;
        return {
          when: (condition) => {
            context.when = condition;
            return {
              do: (action) => {
                // if action is not a value of events, throw
                if (!Object.values(this.actions).includes(action))
                  throw `Action not found in actions: ${Object.keys(this.actions).join(', ')}`;
                context.do = action;
              },
            };
          },
        };
      },
    };
  }

  // return a function that gets evaluated during each mouse event, and returns true when the condition is met
  mouseState(condition) {
    return condition;
  }

  keyboardState(condition) {
    return condition;
  }
}
