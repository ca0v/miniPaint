export class EventManager {
    constructor(scope) {
        if (typeof scope === 'string') {
            scope = document.querySelector(scope);
        }
        if (scope) {
            scope.tabIndex = 0;
            scope.focus();
        }
        this.scope = scope || document
        this.ops = {};
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
            const op = (e) => {
                this.events[event].forEach((callback) => {
                    callback(e);
                });
            };
            this.scope.addEventListener(event, op);
            this.ops[event] = op;
        }
        this.events[event].push(callback);
        return {
            off: () => this.off(event, callback),
        };
    }

    off(event, callback) {
        if (!event) {
            Object.keys(this.ops).forEach((eventName) =>
            this.scope.removeEventListener(eventName, this.ops[eventName]),
            );
            this.ops = [];
            this.events = {};
            return;
        }

        if (!callback) {
            throw `EventManager.off: callback is required for event ${event}`;
        }

        this.events[event] = this.events[event].filter((cb) => cb !== callback);
        if (this.events[event].length === 0) {
            this.scope.removeEventListener(event, this.ops[event]);
            delete this.events[event];
            delete this.ops[event];
        }
    }

    trigger(event, data) {
        const events = this.events[event] || [];
        events.forEach((callback) => {
            callback(data);
        });
    }
}
