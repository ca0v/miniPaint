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
  }

  off() {
    Object.keys(this.ops).forEach((eventName) => document.removeEventListener(eventName, this.ops[eventName]));
    this.ops = [];
    this.events = {};
  }
}
