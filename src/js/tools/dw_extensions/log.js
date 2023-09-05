import alertify from 'alertifyjs/build/alertify.min.js';

const isDebug = window.location.search.includes('debug');

export function log(message) {
    if (!window.__priorLogMessage) window.__priorLogMessage = '';
    if (__priorLogMessage === message) return;
    __priorLogMessage = message;

    // does query string contain "debug"?
    console.log(message);
    alertify.success(message);
}

export function verbose(...messages) {
    console.log(...messages);
}

export function dump(data) {
    console.log(JSON.stringify(data));
}

if (!isDebug) {
    log = () => {};
    verbose = () => {};
    dump = () => {};
}
