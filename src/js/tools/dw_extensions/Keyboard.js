const SPACE = ' ';
const MOUSE_BUTTON = 'Left';
const PLUS = '+';

export const Keyboard = Object.freeze({
    PriorVertex: ['Shift+Tab', 'j'],
    NextVertex: ['Tab', 'l'],
    MovePointLeft: ['ArrowLeft', 'a'],
    MovePointRight: ['ArrowRight', 'd'],
    MovePointUp: ['ArrowUp', 'w'],
    MovePointDown: ['ArrowDown', 's'],
    MovePointUpLeft: ['ArrowLeft+ArrowUp', 'a+w'],
    MovePointUpRight: ['ArrowRight+ArrowUp', 'd+w'],
    MovePointDownLeft: ['ArrowLeft+ArrowDown', 'a+s'],
    MovePointDownRight: ['ArrowRight+ArrowDown', 'd+s'],
    MovePointSnapUp: ['Control+ArrowUp', 'Control+w'],
    MovePointSnapDown: ['Control+ArrowDown', 'Control+s'],
    MovePointSnapLeft: ['Control+ArrowLeft', 'Control+a'],
    MovePointSnapRight: ['Control+ArrowRight', 'Control+d'],
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
    Reset: ['Shift+Escape'],
    StartDragging: [`${MOUSE_BUTTON}+mousedown`, `${SPACE}+${MOUSE_BUTTON}+mousedown`, 'touch:drag', 'touch:begin'],
    Dragging: [`${MOUSE_BUTTON}+mousemove`, `${SPACE}+${MOUSE_BUTTON}+mousemove`, 'touch:drag'],
    EndDragging: [`${MOUSE_BUTTON}+mouseup`, `${SPACE}+${MOUSE_BUTTON}+mouseup`, 'touch:complete'],
    PlacingVertex: ['mousemove'],
    PlacingVertexSnap: ['Control+mousemove'],
    CloneVertex: [SPACE],
    PlaceVertex: [`${MOUSE_BUTTON}+mousedown`],
    ClearInterior: ['x', 'Right+mousedown'],
    ClearExterior: ['Shift+X'],
    Smooth: 'q',
    ClosePolygon: ['Enter', 'touch:complete'],
    DeleteAndClosePolygon: ['Escape'],
    InsertPointAtCursorPosition: [SPACE, `${SPACE}+${MOUSE_BUTTON}+mousemove`],
    Hover: ['Shift+mousemove', 'mousemove', 'touch:drag', 'touch:begin'],
    PlaceFirstVertex: [`${MOUSE_BUTTON}+mousedown`, 'touch:begin'],
    Drawing: [`${MOUSE_BUTTON}+mousedown`, 'touch:drag', 'touch:begin'],
});
