export const Keyboard = Object.freeze({
  PriorVertex: 'Shift+Tab',
  NextVertex: 'Tab',
  MovePointLeft: 'ArrowLeft',
  MovePointRight: 'ArrowRight',
  MovePointUp: 'ArrowUp',
  MovePointDown: 'ArrowDown',
  MovePointLeft10: 'Control+ArrowLeft',
  MovePointRight10: 'Control+ArrowRight',
  MovePointUp10: 'Control+ArrowUp',
  MovePointDown10: 'Control+ArrowDown',
  MovePointUpLeft: ['Control+ArrowLeft+ArrowUp', 'ArrowLeft+ArrowUp'],
  MovePointUpRight: ['Control+ArrowRight+ArrowUp', 'ArrowRight+ArrowUp'],
  MovePointDownLeft: ['Control+ArrowLeft+ArrowDown', 'ArrowLeft+ArrowDown'],
  MovePointDownRight: ['Control+ArrowRight+ArrowDown', 'ArrowRight+ArrowDown'],
  ClonePoint: [' '],
  CenterAt: 'c',
  Delete: 'Delete',
  ZoomIn: ['+', 'Shift++', 'Spread'],
  ZoomOut: ['-', 'Shift+_', 'Pinch'],
  PanLeft: ['PressDragRight', 'Shift+ArrowLeft'],
  PanRight: ['PressDragLeft', 'Shift+ArrowRight'],
  PanUp: ['PressDragDown', 'Shift+ArrowUp'],
  PanDown: ['PressDragUp', 'Shift+ArrowDown'],
  Reset: 'Shift+Escape',
  ClearInterior: 'Shift+X',
  ClearExterior: 'Control+Shift+X',
  Smooth: 'q',
  ClosePolygon: ['Right+mousedown', 'touchend'],
  DeleteAndClosePolygon: ['Escape'],
});
