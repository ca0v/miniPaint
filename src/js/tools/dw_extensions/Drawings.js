import { Status } from './Status.js';

const defaults = Object.freeze({
    major: { color: '#ffffffa0', size: 5 },
    minor: { color: '#ffffffa0', size: 3 },
    hoverMajor: { color: '#00ff0040', size: 16 },
    hoverMinor: { color: '#00ff0040', size: 20 },
    cursor: { color: '#00ff00ff', size: 10, lineWidth: 3 },
    defaultStrokeColor: '#00ff00b0',
    lastMoveVertex: { color: '#ff000080', size: 10, lineWidth: 3 },
    edge: { color: '#00ff0080', lineWidth: 2 },
    fill: { color: '#ffffff01', exclusionColor: '#00000020' },
});

export const Drawings = {
    defaults,
    [Status.editing]: {
        ...defaults,
        major: { color: '#ffffffa0', size: 10 },
    },
    [Status.placing]: {
        ...defaults,
        edge: { color: '#ffff0080', lineWidth: 0.5 },
    },
};

