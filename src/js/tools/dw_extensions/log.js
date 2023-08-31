import alertify from 'alertifyjs/build/alertify.min.js';

export function log(message) {
    if (!window.__priorLogMessage) window.__priorLogMessage = '';
    if (__priorLogMessage === message) return;
    __priorLogMessage = message;

    // does query string contain "debug"?
    if (!window.location.search.includes('debug')) {
        log = () => {};
        return;
    }
    console.log(message);
    alertify.success(message);
}
