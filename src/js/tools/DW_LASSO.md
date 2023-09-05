## Commands

-   <b>add a point to the polygon</b>
    when <kbd>Left+mousedown</kbd> or <kbd>touchmove</kbd> or <kbd>touchstart</kbd> (from drawing)
-   <b>after deleting the last point indicate we are ready for the 1st point</b>
    when <kbd>Delete</kbd> or <kbd>Backspace</kbd> or <kbd>Shift+Left+mousedown</kbd> (editing -> ready)
-   <b>automatically create vertices as mouse moves</b>
    when <kbd>Left+mousemove</kbd> or <kbd> +Left+mousemove</kbd> or <kbd>touchmove</kbd> (from drawing)
-   <b>begin dragging this point</b>
    when <kbd>Left+mousemove</kbd> or <kbd> +Left+mousemove</kbd> or <kbd>touchmove</kbd> (before_dragging -> dragging)
-   <b>center about the current point</b>
    when <kbd>c</kbd> (from editing,dragging,drawing,placing,hover)
-   <b>clear the exterior during an edit</b>
    when <kbd>Control+Shift+X</kbd> (editing,drawing,placing,hover -> ready)
-   <b>clear the interior during an edit</b>
    when <kbd>Shift+X</kbd> (editing,drawing,placing,hover -> ready)
-   <b>close poly when the last is also the first</b>
    when <kbd>mousemove</kbd> (placing -> editing)
-   <b>complete the polygon</b>
    when <kbd>Right+mousedown</kbd> or <kbd>touchend</kbd> (drawing,placing -> editing)
-   <b>continue moving the last point to the mouse location</b>
    when <kbd>mousemove</kbd> (from placing)
-   <b>create the 1st point of the polygon</b>
    when <kbd>Left+mousedown</kbd> or <kbd>touchstart</kbd> (ready -> drawing)
-   <b>delete the hover point</b>
    when <kbd>Delete</kbd> or <kbd>Backspace</kbd> or <kbd>Shift+Left+mousedown</kbd> (editing,hover -> editing)
-   <b>delete the polygon and reset state</b>
    when <kbd>Escape</kbd> (drawing,placing -> editing)
-   <b>delete the polygon and reset state</b>
    when <kbd>Escape</kbd> (editing -> ready)
-   <b>drag this point</b>
    when <kbd>Left+mousemove</kbd> or <kbd> +Left+mousemove</kbd> or <kbd>touchmove</kbd> (from dragging)
-   <b>go to next vertex</b>
    when <kbd>Tab</kbd> (editing,hover -> editing)
-   <b>go to prior vertex</b>
    when <kbd>Shift+Tab</kbd> (editing,hover -> editing)
-   <b>inject smoothing points into the polygon</b>
    when <kbd>q</kbd> (from editing,hover,placing)
-   <b>mouse has moved over a point</b>
    when <kbd>Shift+mousemove</kbd> or <kbd>mousemove</kbd> or <kbd>touchmove</kbd> (editing -> hover)
-   <b>mouse is no longer over a point</b>
    when <kbd>Shift+mousemove</kbd> or <kbd>mousemove</kbd> or <kbd>touchmove</kbd> (hover -> editing)
-   <b>move the point down</b>
    when <kbd>ArrowDown</kbd> (from editing,placing,hover)
-   <b>move the point down and left</b>
    when <kbd>Control+ArrowLeft+ArrowDown</kbd> or <kbd>ArrowLeft+ArrowDown</kbd> (from editing,placing,hover)
-   <b>move the point down and right</b>
    when <kbd>Control+ArrowRight+ArrowDown</kbd> or <kbd>ArrowRight+ArrowDown</kbd> (from editing,placing,hover)
-   <b>move the point left</b>
    when <kbd>ArrowLeft</kbd> (from editing,placing,hover)
-   <b>move the point right</b>
    when <kbd>ArrowRight</kbd> (from editing,placing,hover)
-   <b>move the point up</b>
    when <kbd>ArrowUp</kbd> (from editing,placing,hover)
-   <b>move the point up and left</b>
    when <kbd>Control+ArrowLeft+ArrowUp</kbd> or <kbd>ArrowLeft+ArrowUp</kbd> (from editing,placing,hover)
-   <b>move the point up and right</b>
    when <kbd>Control+ArrowRight+ArrowUp</kbd> or <kbd>ArrowRight+ArrowUp</kbd> (from editing,placing,hover)
-   <b>pan down</b>
    when <kbd>DragDragUp</kbd> or <kbd>Shift+ArrowDown</kbd> (from drawing,hover,editing,ready,placing)
-   <b>pan from</b>
    when <kbd>mousemove</kbd> (from drawing,hover,editing,ready,placing)
-   <b>pan left</b>
    when <kbd>DragDragRight</kbd> or <kbd>Shift+ArrowLeft</kbd> (from drawing,hover,editing,ready,placing)
-   <b>pan right</b>
    when <kbd>DragDragLeft</kbd> or <kbd>Shift+ArrowRight</kbd> (from drawing,hover,editing,ready,placing)
-   <b>pan to</b>
    when <kbd>Shift+mousemove</kbd> (from drawing,hover,editing,ready,placing)
-   <b>pan up</b>
    when <kbd>DragDragDown</kbd> or <kbd>Shift+ArrowUp</kbd> (from drawing,hover,editing,ready,placing)
-   <b>place a point at the mouse location behind the drag point</b>
    when <kbd> </kbd> or <kbd> +Left+mousemove</kbd> (from dragging,editing)
-   <b>prepare to drag this point</b>
    when <kbd>Left+mousedown</kbd> or <kbd> +Left+mousedown</kbd> or <kbd>touchmove</kbd> (hover -> before_dragging)
-   <b>reset the tool</b>
    when <kbd>Shift+Escape</kbd> (editing,drawing,placing,hover,ready -> ready)
-   <b>stop dragging this point</b>
    when <kbd>Left+mouseup</kbd> or <kbd> +Left+mouseup</kbd> or <kbd>touchend</kbd> (dragging -> editing)
-   <b>stop placing and enter drawing mode</b>
    when <kbd>Left+mousedown</kbd> (placing -> drawing)
-   <b>when moving the mouse, move the last point to the mouse location</b>
    when <kbd>mousemove</kbd> (drawing -> placing)
-   <b>zoom in</b>
    when <kbd>+</kbd> or <kbd>=</kbd> or <kbd>Shift++</kbd> or <kbd>Spread</kbd> (from drawing,hover,editing,ready,placing)
-   <b>zoom out</b>
    when <kbd>-</kbd> or <kbd>Shift+\_</kbd> or <kbd>Pinch</kbd> (from drawing,hover,editing,ready,placing)

## Actions

-   beforeDraggingHoverPoint
-   centerAt
-   closePolygon
-   crop
-   cut
-   dataPoints
-   deleteHoverPoint
-   deletePointAndClosePolygon
-   draggingHoverPoint
-   drawPoints
-   endDraggingHoverPoint
-   hoveringOverPoint
-   insertPointBeforeHoverLocation
-   movePointDown1Units
-   movePointDownLeft1Units
-   movePointDownRight1Units
-   movePointLeft1Units
-   movePointRight1Units
-   movePointUp1Units
-   movePointUpLeft1Units
-   movePointUpRight1Units
-   moveToNextPoint
-   moveToPriorPoint
-   movedLastPointToFirstPoint
-   movingLastPointToMouseLocation
-   noDataPoints
-   notHoveringOverPoint
-   panDown
-   panFrom
-   panLeft
-   panRight
-   panTo
-   panUp
-   placeFirstPointAtMouseLocation
-   placePointAtClickLocation
-   reset
-   smooth
-   smoothAllData
-   smoothAroundMinorVertex
-   smoothAroundVertex
-   start
-   zoomIn
-   zoomOut
