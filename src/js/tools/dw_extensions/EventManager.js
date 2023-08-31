export class EventManager {
    constructor() {
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
            document.addEventListener(event, op);
            this.ops[event] = op;
        }
        this.events[event].push(callback);
        return {
            off: () => this.off(event, callback),
        };
    }

    off(event, callback) {
        if (!event) {
            Object.keys(this.ops).forEach((eventName) => document.removeEventListener(eventName, this.ops[eventName]));
            this.ops = [];
            this.events = {};
            return;
        }

        if (!callback) {
            throw `EventManager.off: callback is required for event ${event}`;
        }

        this.events[event] = this.events[event].filter((cb) => cb !== callback);
        if (this.events[event].length === 0) {
            document.removeEventListener(event, this.ops[event]);
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
