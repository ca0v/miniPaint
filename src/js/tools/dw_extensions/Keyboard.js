const SPACE = ' ';
const MOUSE_BUTTON = 'Left';
const PLUS = '+';

export const Keyboard = Object.freeze({
    PriorVertex: 'Shift+Tab',
    NextVertex: 'Tab',
    MovePointLeft: 'ArrowLeft',
    MovePointRight: 'ArrowRight',
    MovePointUp: 'ArrowUp',
    MovePointDown: 'ArrowDown',
    MovePointUpLeft: ['Control+ArrowLeft+ArrowUp', 'ArrowLeft+ArrowUp'],
    MovePointUpRight: ['Control+ArrowRight+ArrowUp', 'ArrowRight+ArrowUp'],
    MovePointDownLeft: ['Control+ArrowLeft+ArrowDown', 'ArrowLeft+ArrowDown'],
    MovePointDownRight: ['Control+ArrowRight+ArrowDown', 'ArrowRight+ArrowDown'],
    CenterAt: 'c',
    Delete: ['Delete', 'Backspace', `Shift+${MOUSE_BUTTON}+mousedown`],
    ZoomIn: [PLUS, '=', `Shift+${PLUS}`, 'Spread'],
    ZoomOut: ['-', 'Shift+_', 'Pinch'],
    PanLeft: ['DragDragRight', 'Shift+ArrowLeft'],
    PanRight: ['DragDragLeft', 'Shift+ArrowRight'],
    PanUp: ['DragDragDown', 'Shift+ArrowUp'],
    PanDown: ['DragDragUp', 'Shift+ArrowDown'],
    PanFrom: ['mousemove'],
    PanTo: ['Shift+mousemove'],
    Reset: 'Shift+Escape',
    StartDragging: [`${MOUSE_BUTTON}+mousedown`, `${SPACE}+${MOUSE_BUTTON}+mousedown`, 'touchmove', 'touchstart'],
    Dragging: [`${MOUSE_BUTTON}+mousemove`, `${SPACE}+${MOUSE_BUTTON}+mousemove`, 'touchmove'],
    EndDragging: [`${MOUSE_BUTTON}+mouseup`, `${SPACE}+${MOUSE_BUTTON}+mouseup`, 'touchend'],
    PlacingVertex: ['mousemove'],
    CloneVertex: [SPACE],
    PlaceVertex: [`${MOUSE_BUTTON}+mousedown`],
    ClearInterior: 'Shift+X',
    ClearExterior: 'Control+Shift+X',
    Smooth: 'q',
    ClosePolygon: ['Enter', 'touchend'],
    DeleteAndClosePolygon: ['Escape'],
    InsertPointAtCursorPosition: [SPACE, `${SPACE}+${MOUSE_BUTTON}+mousemove`],
    Hover: ['Shift+mousemove', 'mousemove', 'touchmove', 'touchstart'],
    PlaceFirstVertex: [`${MOUSE_BUTTON}+mousedown`, 'touchstart'],
    Drawing: [`${MOUSE_BUTTON}+mousedown`, 'touchmove', 'touchstart'],
});
