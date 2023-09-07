const SPACE = ' ';
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
    Delete: ['Delete', 'Backspace', `Shift+Left+mousedown`],
    ZoomIn: [PLUS, '=', `Shift+${PLUS}`, 'Spread'],
    ZoomOut: ['-', 'Shift+_', 'Pinch'],
    PanLeft: ['DragDragRight', 'Shift+ArrowLeft'],
    PanRight: ['DragDragLeft', 'Shift+ArrowRight'],
    PanUp: ['DragDragDown', 'Shift+ArrowUp'],
    PanDown: ['DragDragUp', 'Shift+ArrowDown'],
    PanFrom: ['mousemove'],
    PanTo: ['Shift+mousemove'],
    Reset: ['Shift+Escape'],
    StartDragging: [`Left+mousedown`, `${SPACE}+Left+mousedown`, 'touch:drag', 'touch:begin'],
    Dragging: [`Left+mousemove`, `${SPACE}+Left+mousemove`, 'touch:drag'],
    EndDragging: [`Left+mouseup`, `${SPACE}+Left+mouseup`, 'touch:complete'],
    PlacingVertex: ['mousemove', 'Control+mousemove'],
    PlacingVertexSnap: ['Control+mousemove'],
    CloneVertex: [SPACE],
    PlaceVertex: [`Left+mousedown`, `Control+Left+mousedown`],
    ClearInterior: ['x', 'Right+mouseup'],
    ClearExterior: ['Alt+x', 'Alt+Right+mousedown'],
    Smooth: 'q',
    ClosePolygon: ['Enter', 'touch:complete'],
    DeleteAndClosePolygon: ['Escape'],
    InsertPointAtCursorPosition: [SPACE, `${SPACE}+Left+mousemove`],
    Hover: ['Shift+mousemove', 'mousemove', 'touch:drag', 'touch:begin'],
    PlaceFirstVertex: [`Left+mousedown`, 'touch:begin'],
    Drawing: [`Left+mousedown`, 'touch:drag', 'touch:begin'],
    ReversePolygon: ['k'],
});
