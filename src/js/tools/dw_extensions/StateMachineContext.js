export class StateMachineContext {
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

    butWhen(condition) {
        // if there is already a when, create a new context
        if (!this.context.when)
            throw 'You must call when() before calling butWhen()';
        const newContext = Object.assign({}, this.context);
        this.state.contexts.push(newContext);
        const newOp = new StateMachineContext(this.state, newContext);
        newOp.when(condition);
        return newOp;
    }

    do(action) {
        // if action is not a value of events, throw
        if (!Object.values(this.state.actions).includes(action))
            throw `Action not found in actions: ${Object.keys(
                this.state.actions
            ).join(', ')}, about: ${this.context.about}`;
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
