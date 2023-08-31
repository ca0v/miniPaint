/**
 * ---------------------------------------------------------------------
 * Magic Crop Tool
 * ---------------------------------------------------------------------
 * status values: ready, drawing, placing, editing, hover, dragging, done
 * ready - tool has been initialized and is listening for 1st click
 * drawing - tool has placed a point
 * placing - user is moving mouse deciding where to place the next point
 * editing - user has closed the polygon and can now add/move/delete vertices
 * hover - user is hovering over a vertex or midpoint
 * before_dragging - pragmatic state for capturing undo/redo data
 * dragging - user is dragging a vertex or midpoint
 * done - user has clicked the "Magic Crop" button, all points are cleared
 *
 * ** KNOWN ISSUES **
 * - Load an image then move it and the crop is the wrong part of the image...need to compensate for translations, etc.
 * -- Similarly, cut only working for images that have been cropped to the top-left corner, not sure where the problem is
 * -- but the crop.js works correctly, so the solution is in there somewhere
 * - FIXED: Draw with touch, then use mouse to hover over a point...it is not highlighted and cannot click-and-drag it
 *
 * ** TODO **
 * - Is there a definitive list of touch gestures?  I came up with these:
 * -- Tap (one finger)
 * -- Tap+Tap (one finger)
 * -- Drag (one finger)
 * -- Flick (one finger)
 * -- Pinch (two fingers coming together)
 * -- Spread (two fingers moving apart)
 * -- Press (one finger held for some time)
 * -- Press+Tap (one finger held then tapped second finger)
 * -- Press+Drag (one finger held then dragged second finger)
 * -- Rotate (two fingers moving in a circle, or second finger moving around a first)
 * -- Shake (one finger moving rapidly back and forth)
 * - StateMachine should not be raising pan and zoom events but instead Press+Drag (for pan) and Pinch/Spread (for zoom)
 */
import app from '../app.js';
import config from '../config.js';
import Base_tools_class from '../core/base-tools.js';
import Base_layers_class from '../core/base-layers.js';
import GUI_tools_class from '../core/gui/gui-tools.js';
import Base_gui_class from '../core/base-gui.js';
import GUI_preview_class from '../core/gui/gui-preview.js';
import Base_selection_class from '../core/base-selection.js';
import alertify from 'alertifyjs/build/alertify.min.js';
import Base_state_class from '../core/base-state.js';
import zoomView from './../libs/zoomView.js';
import { Status } from './dw_extensions/Status.js';
import { Drawings } from './dw_extensions/Drawings.js';
import { Keyboard } from './dw_extensions/Keyboard.js';
import { Settings } from './dw_extensions/Settings.js';
import { Generic_action } from './dw_extensions/Generic_action.js';
import { Update_layer_action } from './dw_extensions/Update_layer_action.js';
import { EventManager } from './dw_extensions/EventManager.js';
import { circle } from './dw_extensions/circle.js';
import { dot, cross, plus } from './dw_extensions/dot.js';
import { center } from './dw_extensions/center.js';
import { removeColinearPoints } from './dw_extensions/removeColinearPoints.js';
import { getBoundingBox } from './dw_extensions/getBoundingBox.js';
import { distance } from './dw_extensions/distance.js';
import { age } from './dw_extensions/age.js';
import { angleOf } from './dw_extensions/angleOf.js';
import { debounce } from './dw_extensions/debounce.js';
import { clockwise } from './dw_extensions/clockwise.js';
import { Smooth } from './dw_extensions/Smooth.js';
import { Tests } from './dw_extensions/Tests.js';
import { StateMachine } from './dw_extensions/StateMachine.js';
import { log } from './dw_extensions/log.js';

async function doActions(actions) {
  await app.State.do_action(new app.Actions.Bundle_action('dw_lasso_tool', 'Magic Crop Tool', actions));
}

export default class DwLasso_class extends Base_tools_class {
  constructor(ctx) {
    // without this change I could not do mouse operations after touch operations, the coordinates did not change
    const allowSystemToTrackMouseCoordinates = true;
    super(allowSystemToTrackMouseCoordinates);

    this.name = 'dw_lasso';
    this.ctx = ctx;
    this.data = [];

    this.metrics = {
      timeOfMove: Date.now(),
      lastPointMoved: null,
      speed: 1,
      ACCELERATION: 0.3,
      MAX_SPEED: 25,
      MIN_SPEED: 1,
      DEFAULT_SPEED: 1,
    };

    this.Base_layers = new Base_layers_class();
    this.Base_state = new Base_state_class();
    this.GUI_preview = new GUI_preview_class();
    this.Base_gui = new Base_gui_class();
    this.GUI_tools = new GUI_tools_class();
    this.selection = {
      x: null,
      y: null,
      width: null,
      height: null,
    };
    const sel_config = {
      enable_background: true,
      enable_borders: true,
      enable_controls: true,
      crop_lines: true,
      enable_rotation: false,
      enable_move: false,
      data_function: () => this.selection,
    };
    this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);

    this.delayedSnapshot = debounce((about) => {
      this.snapshot(about);
    }, Settings.delayedSnapshotTimeout);
  }

  get scale() {
    return 1 / config.ZOOM;
  }

  on_activate() {
    console.log('dw_lasso: on_activate');
    this.defineStateMachine();
    this.state.setCurrentState(Status.none);
    this.metrics.prior_action_history_max = this.Base_state.action_history_max;
    this.Base_state.action_history_max = 1000;

    const params_hash = this.get_params_hash();
    const opacity = Math.round((config.ALPHA / 255) * 100);

    const layer = config?.layers.find((l) => l.type === this.name);

    if (!layer) {
      const layer = {
        name: 'DW Lasso',
        type: this.name,
        opacity: opacity,
        params: this.clone(this.getParams()),
        status: 'draft',
        render_function: [this.name, 'render'],
        x: 0,
        y: 0,
        width: config.WIDTH,
        height: config.HEIGHT,
        hide_selection_if_active: true,
        rotate: null,
        is_vector: true,
        color: config.COLOR,
      };
      app.State.do_action(
        new app.Actions.Bundle_action('new_dw_lasso_layer', 'Magic Crop Layer', [
          new app.Actions.Insert_layer_action(layer),
        ]),
      );
      this.params_hash = params_hash;
    } else {
      // bring layer to the top
      while (app.Layers.find_next(layer.id)) app.State.do_action(new app.Actions.Reorder_layer_action(layer.id, 1));
      this.renderData();
    }
  }

  on_leave() {
    this.state.off();

    this.Base_state.action_history_max = this.metrics.prior_action_history_max;

    // delete the magic crop layer
    const actions = [new app.Actions.Reset_selection_action()];
    this.addDeleteToolAction(actions);
    return actions;
  }
  get status() {
    return this.state.currentState;
  }

  set status(value) {
    this.state.setCurrentState(value);
  }

  load() {}

  default_dragStart(event) {
    this.is_mousedown_canvas = false;
    if (config.TOOL.name != this.name) return;
    if (!event.target.closest('#main_wrapper')) return;
    this.is_mousedown_canvas = true;
    this.mousedown(event);
  }

  centerAt(point) {
    const { x: px, y: py } = point;
    const dx = -0.5 * config.visible_width * this.scale;
    const dy = -0.5 * config.visible_height * this.scale;
    this.GUI_preview.zoom_to_position(px + dx, py + dy);
  }

  renderData() {
    this.Base_layers.render();
  }

  render(ctx, layer) {
    this.drawMask(ctx);
    this.drawTool(ctx, layer);
  }

  drawMask(ctx) {
    const pointData = this.data;
    if (pointData.length < 3) return;

    // fill the entire ctx with a light gray except the polygon defined by the point data
    ctx.fillStyle = Drawings.fill.exclusionColor;
    ctx.beginPath();
    ctx.rect(0, 0, config.WIDTH, config.HEIGHT);
    const clockwiseData = clockwise(pointData);
    renderAsPath(ctx, clockwiseData);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = Drawings.fill.color;
    renderAsPath(ctx, pointData);
    ctx.closePath();
    ctx.fill();
  }

  drawTool(ctx, layer) {
    const { x, y, color, params } = layer;

    // scale down the size based on the zoom level
    const size = (params.size || 1) * this.scale;

    const data = this.data;
    if (!data.length) return;

    //set styles
    ctx.strokeStyle = Drawings.defaultStrokeColor;
    ctx.lineWidth = size;
    ctx.translate(x, y);

    ctx.beginPath();
    renderAsPath(ctx, data);
    ctx.closePath();
    ctx.stroke();

    // now render the drag-points over the top of the lines
    data.forEach((currentPoint, i) => {
      if (currentPoint === this.metrics.lastPointMoved && age(this.metrics.timeOfMove) < 1000) {
        cross(ctx, currentPoint, {
          color: Drawings.lastMoveStrokeColor,
          size: Drawings.hoverMajor.size * this.scale,
          lineWidth: 2 * this.scale,
        });
      } else if (this.hover?.pointIndex === i) {
        cross(ctx, currentPoint, {
          color: Drawings.hoverMajor.color,
          size: Drawings.hoverMajor.size * this.scale,
          lineWidth: 1 * this.scale,
        });
      } else {
        // draw a circle
        circle(ctx, currentPoint, {
          size: Drawings.major.size * this.scale,
          lineWidth: this.scale,
          color: Drawings.major.color || Drawings.defaultStrokeColor,
        });
        //dot(ctx, currentPoint, { size: this.scale, color: Drawings.major.color });
      }
    });

    // also, draw semi-drag points at the centerpoint of each line
    data.forEach((currentPoint, i) => {
      const nextPoint = data[(i + 1) % data.length];
      // scale down the size based on the zoom level

      const centerPoint = center(currentPoint, nextPoint);

      if (this.hover && this.hover.midpointIndex == i) {
        plus(ctx, centerPoint, {
          color: Drawings.hoverMinor.color,
          size: Drawings.hoverMinor.size * this.scale,
          lineWidth: 1 * this.scale,
        });
      } else {
        // draw a circle
        circle(ctx, centerPoint, {
          size: Drawings.minor.size * this.scale,
          color: Drawings.minor.color || Drawings.defaultStrokeColor,
          lineWidth: 1 * this.scale,
        });
      }
    });

    ctx.translate(-x, -y);
  }

  snapshot(why, cb) {
    const action = new Update_layer_action(this, why, cb);
    app.State.do_action(action);
  }

  undoredo(why, doit, undo) {
    const action = new Generic_action(this, { why, doit, undo });
    app.State.do_action(action);
  }

  /**
   * do actual crop
   */
  async on_params_update(event) {
    switch (event.key) {
      case 'dw_cut':
        this.state.trigger(Keyboard.ClearInterior);
        this.getParams()[event.key] = true;
        break;
      case 'dw_crop':
        this.state.trigger(Keyboard.ClearExterior);
        break;
      case 'dw_reset':
        this.state.trigger(Keyboard.Reset);
        break;
      default:
        break;
    }
  }

  reset() {
    this.snapshot('before reset', () => (this.data = []));
    this.renderData();
  }

  async cut() {
    const fillColor = config.COLOR;

    const imageLayers = config.layers.filter((l) => l.type === 'image');
    if (!imageLayers.length) {
      alertify.error('No image layers found');
      return;
    }

    const actions = [];

    // for each image layer, fill the selection with the background color
    imageLayers.forEach((link) => {
      const { x, y, width, height, width_original, height_original } = link;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;

      // copy the original image to the canvas
      ctx.translate(x, y);
      ctx.drawImage(link.link, 0, 0);

      // draw the clipping path
      ctx.beginPath();
      renderAsPath(ctx, this.data);
      ctx.closePath();
      ctx.clip();

      if (!this.getParams().dw_transparent) {
        // fill the canvas with the background color
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        // clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // update the link with the new image
      actions.push(new app.Actions.Update_layer_image_action(canvas, link.id));
    });

    // clear the data and reset the state
    this.reset();

    await doActions(actions);
  }

  async crop() {
    const data = this.data;
    if (data.length == 0) return;

    const actions = [];

    const bbox = getBoundingBox(data);
    const cropWidth = bbox.right - bbox.left;
    const cropHeight = bbox.bottom - bbox.top;

    const cropTop = bbox.top;
    const cropLeft = bbox.left;

    const imageLayers = config.layers.filter((l) => l.type === 'image');
    if (!imageLayers.length) {
      alertify.error('No image layers found');
      return;
    }

    imageLayers.forEach((link) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const { x, y } = link;

      //cut required part
      ctx.translate(-cropLeft - x, -cropTop);
      ctx.drawImage(link.link, 0, 0);
      ctx.translate(0, 0);

      // crop everything outside the polygon
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = config.COLOR;
      ctx.beginPath();
      renderAsPath(ctx, data);
      ctx.closePath();
      ctx.fill();

      if (!this.getParams().dw_transparent) {
        // now create a solid background
        const background = document.createElement('canvas').getContext('2d');
        background.canvas.width = canvas.width;
        background.canvas.height = canvas.height;
        background.fillStyle = config.COLOR;
        background.fillRect(0, 0, canvas.width, canvas.height);
        // now copy the cropped image onto the background
        background.drawImage(canvas, 0, 0);
        actions.push(new app.Actions.Update_layer_image_action(background.canvas, link.id));
      } else {
        actions.push(new app.Actions.Update_layer_image_action(canvas, link.id));
      }

      actions.push(
        new app.Actions.Update_layer_action(link.id, {
          x: 0,
          y: 0,
          width: cropWidth,
          height: cropHeight,
          width_original: cropWidth,
          height_original: cropWidth,
        }),
      );
    });

    this.snapshot('before cropping', () => (this.data = []));

    await doActions(actions);
  }

  addDeleteToolAction(actions) {
    config.layers
      .filter((l) => l.type === this.name)
      .map((l) => {
        actions.push(new app.Actions.Delete_layer_action(l.id));
      });
  }

  mousePoint(e) {
    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return null;
    return { x: Math.max(0, Math.min(config.WIDTH, mouse.x)), y: Math.max(0, Math.min(config.HEIGHT, mouse.y)) };
  }

  clonePoint() {
    const lastPoint = this.data.at(-1);
    if (!lastPoint) return;
    const newPoint = { x: lastPoint.x, y: lastPoint.y };
    this.data.push(newPoint);
    this.hover = { pointIndex: this.data.length - 1 };
    this.renderData();
  }

  placePointAtClickLocation(mouseEvent) {
    const currentPoint = this.mousePoint(mouseEvent);
    if (!currentPoint) return false;

    this.undoredo(
      `before placing point ${this.data.length + 1}`,
      () => {
        this.data.push(currentPoint);
        this.hover = { pointIndex: this.data.length - 1 };
      },
      () => this.data.pop(),
    );
  }

  movingLastPointToMouseLocation(mouseEvent) {
    const currentPoint = this.mousePoint(mouseEvent);
    if (!currentPoint) return false;
    if (!this.data.length) return;
    const p = this.data.at(-1);
    p.x = currentPoint.x;
    p.y = currentPoint.y;
    this.hover = { pointIndex: this.data.length - 1 };
    this.renderData();
  }

  defineStateMachine() {
    if (this.state) {
      this.state.off();
      console.log('dw_lasso: state machine off');
      this.data = [];
    }
    this.state = new StateMachine(Object.values(Status));
    this.state.on('execute', (context) => context.about && log(`${context.about}`));

    this.state.register({
      start: () => {},
      beforeDraggingHoverPoint: (mouseEvent) => {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;

        if (this.hover?.pointIndex >= 0) {
          const index = this.hover.pointIndex;
          this.hover.point = this.data.at(index);

          const { x: original_x, y: original_y } = this.data.at(index);
          let { x: redo_x, y: redo_y } = currentPoint;
          this.undoredo(
            `before dragging point ${index} from ${original_x}, ${original_y}`,
            () => {
              const point = this.data.at(index);
              point.x = redo_x;
              point.y = redo_y;
            },
            () => {
              const point = this.data.at(index);
              redo_x = point.x;
              redo_y = point.y;
              point.x = original_x;
              point.y = original_y;
            },
          );
          // render the line
          this.Base_layers.render();
        } else if (this.hover?.midpointIndex >= 0) {
          const index = this.hover.midpointIndex;
          this.undoredo(
            `before dragging midpoint ${index}`,
            () => this.data.splice(index + 1, 0, currentPoint),
            () => this.data.splice(index + 1, 1),
          );
          this.hover = { pointIndex: index + 1 };
          this.hover.point = this.data.at(index + 1);
          // render the line
          this.Base_layers.render();
        }
      },
      draggingHoverPoint: (mouseEvent) => {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;

        if (this.hover?.point) {
          const point = this.hover.point;
          console.log(
            `dragging point ${this.hover.pointIndex} from ${point.x}, ${point.y} to ${currentPoint.x}, ${currentPoint.y}`,
          );
          point.x = currentPoint.x;
          point.y = currentPoint.y;
          this.metrics.timeOfMove = Date.now();
          this.metrics.lastPointMoved = point;
          this.Base_layers.render();
        } else {
          log(`mousemove: no point to drag`);
        }
      },
      endDraggingHoverPoint: () => {},

      drawPoints: (mouseEvent) => {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;

        const data = this.data;
        const priorPoint = data.at(-2);
        if (!priorPoint) {
          this.placePointAtClickLocation(mouseEvent);
          return false;
        }

        const isSecondPoint = data.length === 2;

        const d = distance(priorPoint, currentPoint) / this.scale;
        let drawPoint = d > (isSecondPoint ? Settings.minimalDistanceBetweenPoints : Settings.distanceBetweenPoints);

        if (!drawPoint && data.length > 2 && d > Settings.minimalDistanceBetweenPoints) {
          const a = Math.PI - angleOf(data.at(-3), priorPoint, currentPoint);
          drawPoint = d * a > Settings.radiusThreshold * Settings.distanceBetweenPoints;
        }
        if (drawPoint) {
          data.push(currentPoint);
          this.hover = { pointIndex: data.length - 1 };
        } else {
          const p = data.at(-1);
          p.x = currentPoint.x;
          p.y = currentPoint.y;
        }
        this.renderData();
        this.delayedSnapshot(`before drawing points at location ${data.length}`);
      },

      placeFirstPointAtMouseLocation: (mouseEvent) => {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;
        this.snapshot('before placing 1st point', () => {
          this.data = [currentPoint];
        });
      },

      clonePoint: () => this.clonePoint(),
      placePointAtClickLocation: (e) => this.placePointAtClickLocation(e),
      movingLastPointToMouseLocation: () => this.movingLastPointToMouseLocation(),

      moveToPriorPoint: () => this.moveToNextVertex(-1),
      moveToNextPoint: () => this.moveToNextVertex(1),

      movePointLeft1Units: () => this.movePoint(-1, 0),
      movePointRight1Units: () => this.movePoint(1, 0),
      movePointUp1Units: () => this.movePoint(0, -1),
      movePointDown1Units: () => this.movePoint(0, 1),

      movePointUpLeft1Units: () => this.movePoint(-1, -1),
      movePointUpRight1Units: () => this.movePoint(1, -1),
      movePointDownLeft1Units: () => this.movePoint(-1, 1),
      movePointDownRight1Units: () => this.movePoint(1, 1),

      closePolygon: () => {},
      deletePointAndClosePolygon: () => {
        this.deletePoint();
      },
      dataPoints: () => !!this.data.length,
      noDataPoints: () => !this.data.length,

      deleteHoverPoint: () => {
        const hover = !!this.hover?.pointIndex || !!this.hover?.midpointIndex;
        if (hover) {
          this.deletePoint();
        }
        return hover;
      },

      hoveringOverPoint: (mouseEvent) => {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;
        const priorHover = JSON.stringify(this.hover || null);
        const hover = this.computeHover(this.data, currentPoint);
        if (hover) {
          // track the last point we were hovering over
          this.hover = hover;
        }
        if (priorHover != JSON.stringify(hover)) {
          this.Base_layers.render();
        }
        return !!hover;
      },

      notHoveringOverPoint: (e) => !this.state.actions.hoveringOverPoint(e),

      zoomIn: (e) => this.zoomViewport(e, 1),
      zoomOut: (e) => this.zoomViewport(e, -1),
      panLeft: (e) => this.panViewport2(e, 1, 0),
      panRight: (e) => this.panViewport2(e, -1, 0),
      panUp: (e) => this.panViewport2(e, 0, 1),
      panDown: (e) => this.panViewport2(e, 0, -1),

      reset: () => this.reset(),
      cut: () => this.cut(),
      crop: () => this.crop(),

      smooth: () => {
        if (typeof this.hover?.pointIndex === 'number') return this.state.actions.smoothAroundVertex();
        if (typeof this.hover?.midpointIndex === 'number') return this.state.actions.smoothAroundMinorVertex();
        return this.state.actions.smoothAllData();
      },

      smoothAllData: () => {
        this.snapshot('before smoothing', () => (this.data = new Smooth().smooth(this.data)));
      },

      smoothAroundVertex: () => {
        const index = this.hover.pointIndex;
        if (typeof index !== 'number') return false;
        this.snapshot(`before smoothing around vertex ${index}`, () => {
          const success = new Smooth().smoothAroundVertex(this.data, index);
          if (success) {
            this.hover.pointIndex = index + 1;
          }
        });
      },

      smoothAroundMinorVertex: () => {
        const index = this.hover.midpointIndex;
        if (typeof index !== 'number') return false;
        this.snapshot(`before smoothing around minor vertex ${index}`, () => {
          const success = new Smooth().smoothAroundMinorVertex(this.data, index);
          if (success) {
            this.hover.pointIndex = index + 1;
            this.hover.midpointIndex = null;
          }
        });
      },

      centerAt: () => {
        const isMajorVertex = typeof this.hover?.pointIndex === 'number';
        const isMinorVertex = !isMajorVertex && typeof this.hover?.midpointIndex === 'number';

        if (isMajorVertex) {
          const pointIndex = this.hover.pointIndex;
          console.log(`centering at point ${pointIndex}`);
          this.centerAt(this.data[pointIndex]);
        } else if (isMinorVertex) {
          const pointIndex = this.hover.midpointIndex;
          console.log(`centering at midpoint ${pointIndex}`);
          this.centerAt(center(this.data.at(pointIndex), this.data.at((pointIndex + 1) % this.data.length)));
        } else {
          console.log(`nothing to center about`);
          return;
        }
        this.Base_layers.render();
      },
    });

    this.state.about('no data found').from(Status.none).goto(Status.ready).do(this.state.actions.noDataPoints);

    this.state.about('data found').from(Status.none).goto(Status.editing).do(this.state.actions.dataPoints);

    this.state
      .about('reset the tool')
      .from([Status.editing, Status.drawing, Status.placing, Status.hover])
      .goto(Status.ready)
      .when(Keyboard.Reset)
      .do(this.state.actions.reset);

    this.state
      .about('clear the interior during an edit')
      .from([Status.editing, Status.drawing, Status.placing, Status.hover])
      .goto(Status.ready)
      .when(Keyboard.ClearInterior)
      .do(this.state.actions.cut);

    this.state
      .about('clear the exterior during an edit')
      .from([Status.editing, Status.drawing, Status.placing, Status.hover])
      .goto(Status.ready)
      .when(Keyboard.ClearExterior)
      .do(this.state.actions.crop);

    this.state
      .about('inject smoothing points into the polygon')
      .from([Status.editing, Status.hover, Status.placing])
      .when(Keyboard.Smooth)
      .do(this.state.actions.smooth);

    this.state
      .about('center about the current point')
      .from([Status.editing, Status.drawing, Status.placing, Status.hover])
      .when(Keyboard.CenterAt)
      .do(this.state.actions.centerAt);

    this.state
      .about('prepare to drag this point')
      .from(Status.hover)
      .goto(Status.before_dragging)
      .when(['Left+mousedown', 'touchmove'])
      .do(this.state.actions.beforeDraggingHoverPoint);

    this.state
      .about('stop dragging this point')
      .from(Status.before_dragging)
      .goto(Status.hover)
      .when(['Left+mouseup', 'touchend'])
      .do(this.state.actions.beforeDraggingHoverPoint);

    this.state
      .about('begin dragging this point')
      .from(Status.before_dragging)
      .goto(Status.dragging)
      .when(['Left+mousemove', 'touchmove'])
      .do(this.state.actions.draggingHoverPoint);

    this.state
      .about('drag this point')
      .from(Status.dragging)
      .when(['Left+mousemove', 'touchmove'])
      .do(this.state.actions.draggingHoverPoint);

    this.state
      .about('automatically create vertices as mouse moves')
      .from(Status.drawing)
      .when(['Left+mousemove', 'touchmove'])
      .do(this.state.actions.drawPoints);

    this.state
      .about('when moving the mouse, move the last point to the mouse location')
      .from(Status.drawing)
      .goto(Status.placing)
      .when('mousemove')
      .do(this.state.actions.placePointAtClickLocation);

    this.state
      .about('stop dragging this point')
      .from(Status.dragging)
      .goto(Status.editing)
      .when(['Left+mouseup', 'touchend'])
      .do(this.state.actions.endDraggingHoverPoint);

    this.state
      .about('create the 1st point of the polygon')
      .from(Status.ready)
      .goto(Status.drawing)
      .when(['Left+mousedown', 'touchmove'])
      .do(this.state.actions.placeFirstPointAtMouseLocation);

    this.state
      .about('stop placing and enter drawing mode')
      .from(Status.placing)
      .goto(Status.drawing)
      .when(['Left+mousedown']);

    this.state
      .about('continue moving the last point to the mouse location')
      .from(Status.placing)
      .when('mousemove')
      .do(this.state.actions.movingLastPointToMouseLocation);

    this.state
      .about('add a point to the polygon')
      .from(Status.drawing)
      .when(['Left+mousedown', 'touchmove', 'touchstart'])
      .do(this.state.actions.placePointAtClickLocation);

    this.state
      .about('add a point to the polygon')
      .from(Status.placing)
      .when(Keyboard.ClonePoint)
      .do(this.state.actions.clonePoint);

    this.state
      .about('zoom')
      .from([Status.drawing, Status.editing, Status.ready, Status.placing])
      .when(Keyboard.ZoomIn)
      .do(this.state.actions.zoomIn)
      .butWhen(Keyboard.ZoomOut)
      .do(this.state.actions.zoomOut);

    this.state
      .about('pan')
      .from([Status.drawing, Status.editing, Status.ready, Status.placing])
      .when(Keyboard.PanLeft)
      .do(this.state.actions.panLeft)
      .butWhen(Keyboard.PanRight)
      .do(this.state.actions.panRight)
      .butWhen(Keyboard.PanUp)
      .do(this.state.actions.panUp)
      .butWhen(Keyboard.PanDown)
      .do(this.state.actions.panDown);

    this.state
      .about('set focus to sibling vertex')
      .from([Status.editing, Status.hover])
      .goto(Status.editing)
      .when(Keyboard.PriorVertex)
      .do(this.state.actions.moveToPriorPoint)
      .butWhen(Keyboard.NextVertex)
      .do(this.state.actions.moveToNextPoint);

    this.state
      .about('move the point')
      .from([Status.editing, Status.placing])
      .when(Keyboard.MovePointLeft)
      .do(this.state.actions.movePointLeft1Units)
      .butWhen(Keyboard.MovePointRight)
      .do(this.state.actions.movePointRight1Units)
      .butWhen(Keyboard.MovePointUp)
      .do(this.state.actions.movePointUp1Units)
      .butWhen(Keyboard.MovePointDown)
      .do(this.state.actions.movePointDown1Units)
      .butWhen(Keyboard.MovePointUpLeft)
      .do(this.state.actions.movePointUpLeft1Units)
      .butWhen(Keyboard.MovePointUpRight)
      .do(this.state.actions.movePointUpRight1Units)
      .butWhen(Keyboard.MovePointDownLeft)
      .do(this.state.actions.movePointDownLeft1Units)
      .butWhen(Keyboard.MovePointDownRight)
      .do(this.state.actions.movePointDownRight1Units);

    this.state
      .about('after deleting the last point indicate we are ready for the 1st point')
      .from(Status.editing)
      .goto(Status.ready)
      .when(Keyboard.Delete)
      .do(this.state.actions.noDataPoints);

    this.state
      .about('delete the hover point after dragging')
      .from(Status.editing)
      .when(Keyboard.Delete)
      .do(this.state.actions.deleteHoverPoint);

    this.state
      .about('delete the hover point')
      .from(Status.hover)
      .goto(Status.editing)
      .when(Keyboard.Delete)
      .do(this.state.actions.deleteHoverPoint);

    this.state
      .about('delete the hover point')
      .from(Status.hover)
      .goto(Status.editing)
      .when('Shift+Left+mousedown')
      .do(this.state.actions.deleteHoverPoint);

    this.state
      .about('mouse has moved over a point')
      .from(Status.editing)
      .goto(Status.hover)
      .when(['Shift+mousemove', 'mousemove', 'touchmove'])
      .do(this.state.actions.hoveringOverPoint);

    this.state
      .about('mouse is no longer over a point')
      .from(Status.hover)
      .goto(Status.editing)
      .when(['Shift+mousemove', 'mousemove', 'touchmove'])
      .do(this.state.actions.notHoveringOverPoint);

    this.state
      .about('complete the polygon')
      .from([Status.drawing, Status.placing])
      .goto(Status.editing)
      .when(Keyboard.ClosePolygon)
      .do(this.state.actions.closePolygon)
      .butWhen(Keyboard.DeleteAndClosePolygon)
      .do(this.state.actions.deletePointAndClosePolygon);

    this.state
      .about('delete the polygon and reset state')
      .from([Status.editing])
      .goto(Status.ready)
      .when(Keyboard.DeleteAndClosePolygon)
      .do(this.state.actions.reset);
  }

  computeHover(data, currentPoint) {
    const pointIndex = data.findIndex((point) => {
      const distanceToCurrentPoint = distance(point, currentPoint);
      return distanceToCurrentPoint < Drawings.hoverMajor.size * this.scale;
    });

    if (pointIndex > -1) return { pointIndex };

    // is the current point within 5 pixels of any of the midpoints of the lines?
    const midpointIndex = data.findIndex((point, i) => {
      const nextPoint = data[(i + 1) % data.length];
      const centerPoint = center(point, nextPoint);
      const distanceToCurrentPoint = distance(centerPoint, currentPoint);
      return distanceToCurrentPoint < Drawings.hoverMinor.size * this.scale;
    });

    if (midpointIndex > -1) {
      return { midpointIndex };
    }

    return null;
  }

  movePoint(dx, dy) {
    if (!dx && !dy) return; // nothing to do

    const lasso = this;

    const isMidpoint = lasso.hover?.midpointIndex >= 0;

    const timeOfLastMove = this.metrics.timeOfMove;
    this.metrics.timeOfMove = Date.now();
    // if the time between moves is short, then increase the speed, but if it's long, then reset the speed
    if (timeOfLastMove && this.metrics.timeOfMove - timeOfLastMove < 100) {
      this.metrics.speed = Math.max(
        this.metrics.MIN_SPEED,
        Math.min(this.metrics.MAX_SPEED, this.metrics.speed + this.metrics.ACCELERATION),
      );
    } else {
      this.metrics.speed = this.metrics.DEFAULT_SPEED;
    }

    dx *= this.metrics.speed * this.scale;
    dy *= this.metrics.speed * this.scale;

    if (isMidpoint) {
      // create the point an select the new point
      const index = lasso.hover.midpointIndex;
      const point = center(lasso.data.at(index), lasso.data.at((index + 1) % lasso.data.length));
      lasso.snapshot('before moving point', () => {
        lasso.data.splice(index + 1, 0, point);
      });
      lasso.hover = { pointIndex: index + 1 };
    }

    lasso.delayedSnapshot('point moved');
    const point = lasso.data.at(lasso.hover.pointIndex);
    point.x += dx;
    point.y += dy;
    lasso.metrics.timeOfMove = Date.now();
    lasso.metrics.lastPointMoved = point;
    lasso.Base_layers.render();
  }

  moveToNextVertex(indexOffset) {
    if (!indexOffset) return;
    const lasso = this;

    const isMidpoint = lasso.hover?.midpointIndex >= 0;
    let pointIndex = lasso.hover?.pointIndex || lasso.hover?.midpointIndex || 0;

    if (isMidpoint) {
      pointIndex += indexOffset;
      if (indexOffset < 0) pointIndex++;

      lasso.hover = {
        pointIndex: (pointIndex + lasso.data.length) % lasso.data.length,
      };
    } else {
      pointIndex += indexOffset;
      if (indexOffset > 0) pointIndex--;

      lasso.hover = {
        midpointIndex: (pointIndex + lasso.data.length) % lasso.data.length,
      };
    }
    lasso.Base_layers.render();
  }

  zoomViewport(mouseEvent, zoom) {
    const lasso = this;
    if (!zoom) return;

    // is this a pinch gesture?
    if (mouseEvent.touches?.length === 2) {
      const touch1 = mouseEvent.touches[0];
      const touch2 = mouseEvent.touches[1];
      const centerPoint = center({ x: touch1.clientX, y: touch1.clientY }, { x: touch2.clientX, y: touch2.clientY });

      console.log(`pinch zoom at ${centerPoint.x}, ${centerPoint.y}`);
      lasso.GUI_preview.zoom_data.x = centerPoint.x;
      lasso.GUI_preview.zoom_data.y = centerPoint.y;
      lasso.GUI_preview.zoom(zoom);
      return;
    }

    {
      // is there an active vertex?
      if (typeof lasso.hover?.pointIndex === 'number') {
        const point = lasso.data.at(lasso.hover.pointIndex);
        const screenPoint = zoomView.toScreen(point);
        lasso.GUI_preview.zoom_data.x = screenPoint.x;
        lasso.GUI_preview.zoom_data.y = screenPoint.y;
        lasso.GUI_preview.zoom(zoom);
        return;
      }
    }

    lasso.undoredo(
      'before zooming',
      () => {
        lasso.GUI_preview.zoom(zoom);
      },
      () => {
        lasso.GUI_preview.zoom(-zoom);
      },
    );
    lasso.Base_layers.render();
  }

  panViewport(dx, dy) {
    if (!dx && !dy) return;
    dx = -Math.round(dx);
    dy = -Math.round(dy);

    let { x, y } = zoomView.getPosition();
    const currentPosition = { x: -x * this.scale, y: -y * this.scale };
    this.GUI_preview.zoom_to_position(currentPosition.x + dx, currentPosition.y + dy);
  }

  panViewport2(e, dx, dy) {
    function closeTo(expected, actual, tolerance = 70) {
      return Math.abs(expected - actual) < tolerance;
    }

    if (e) {
      const { dragDistanceInPixels: distance, dragDirectionInDegrees: degrees } = e;
      const draggingUp = closeTo(degrees, -90);
      const draggingDown = closeTo(degrees, 90);
      const draggingLeft = closeTo(degrees, 180);
      const draggingRight = closeTo(degrees, 0);

      if (draggingLeft) dx = -distance; // pan right
      else if (draggingRight) dx = distance; // pan left

      if (draggingUp) dy = -distance; // pan down
      else if (draggingDown) dy = distance; // pan up
    }

    this.panViewport(dx, dy);
  }

  deletePoint() {
    const lasso = this;
    const pointIndex = lasso.hover?.pointIndex || lasso.hover?.midpointIndex || this.data.length - 1;

    lasso.snapshot('before deleting point', () => {
      lasso.data.splice(pointIndex, 1);
    });
  }
}

function renderAsPath(ctx, points) {
  if (!points.length) throw 'no data to render';
  const lastPoint = points.at(-1);
  ctx.moveTo(lastPoint.x, lastPoint.y);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
}

new Tests().tests();
