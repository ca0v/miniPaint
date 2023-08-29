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
 *
 * ** TODO **
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

class DwLasso_class extends Base_tools_class {
  constructor(ctx) {
    super();

    this.name = 'dw_lasso';
    this.ctx = ctx;
    this.data = [];

    this.metrics = {
      timeOfMove: Date.now(),
      lastPointMoved: null,
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
      console.log(`delayedSnapshot: ${about}`);
      this.snapshot(about);
    }, Settings.delayedSnapshotTimeout);
  }

  on_activate() {
    this.defineStateMachine();
    this.state.setCurrentState(Status.none);
    this.metrics.prior_action_history_max = this.Base_state.action_history_max;
    this.Base_state.action_history_max = 1000;

    const params_hash = this.get_params_hash();
    const opacity = Math.round((config.ALPHA / 255) * 100);

    const layer = config?.layers.find((l) => l.type === this.name);

    if (!layer) {
      console.log(`creating new magic crop layer`);
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
    // pan the canvas so that the point is centered
    const { x: dx, y: dy } = zoomView.getPosition();
    const { x: px, y: py } = point;
    const pos_global = zoomView.toScreen(point);

    console.log(`point at: ${px}, ${py} zoom at: ${dx}, ${dy}, moving to: ${pos_global.x}, ${pos_global.y}`);

    // preview top-left of point
    zoomView.move(-pos_global.x, -pos_global.y);
    zoomView.move(config.WIDTH / 2, config.HEIGHT / 2);

    // scale
    zoomView.apply();
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
    ctx.moveTo(clockwiseData[0].x, clockwiseData[0].y);
    clockwiseData.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = Drawings.fill.color;
    try {
      ctx.moveTo(pointData[0].x, pointData[0].y);
      pointData.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
    } finally {
      ctx.closePath();
    }
    ctx.fill();
  }

  drawTool(ctx, layer) {
    const { x, y, color, params } = layer;

    // scale down the size based on the zoom level
    const size = (params.size || 1) / config.ZOOM;

    const data = this.data;
    if (!data.length) return;

    //set styles
    ctx.strokeStyle = Drawings.defaultStrokeColor;
    ctx.lineWidth = size;
    ctx.translate(x, y);

    const firstPoint = data.at(0);

    ctx.beginPath();
    try {
      ctx.moveTo(firstPoint.x, firstPoint.y);
      data.forEach((_, i) => {
        const nextPoint = data.at((i + 1) % data.length);
        ctx.lineTo(nextPoint.x, nextPoint.y);
      });
    } finally {
      ctx.closePath();
      ctx.stroke();
    }

    // now render the drag-points over the top of the lines
    data.forEach((currentPoint, i) => {
      ctx.fillStyle = Drawings.major.color;

      // the circle should have an outline
      ctx.strokeStyle = Drawings.defaultStrokeColor;
      ctx.lineWidth = 1 / config.ZOOM;

      // scale down the size based on the zoom level
      let size = Drawings.major.size / config.ZOOM;

      if (currentPoint === this.metrics.lastPointMoved && age(this.metrics.timeOfMove) < 1000) {
        cross(ctx, currentPoint, {
          color: Drawings.lastMoveStrokeColor,
          size: Drawings.hoverMajor.size / config.ZOOM,
          lineWidth: 1 / config.ZOOM,
        });
      } else if (this.hover?.pointIndex === i) {
        cross(ctx, currentPoint, { color: Drawings.hoverMajor.color, size: Drawings.hoverMajor.size / config.ZOOM });
      } else {
        // draw a circle
        circle(ctx, currentPoint, { size, color: Drawings.defaultStrokeColor });
        dot(ctx, currentPoint, { color: Drawings.major.color });
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
          size: Drawings.hoverMinor.size / config.ZOOM,
          lineWidth: 1 / config.ZOOM,
        });
      } else {
        // draw a circle
        circle(ctx, centerPoint, {
          size: Drawings.minor.size / config.ZOOM,
          color: Drawings.defaultStrokeColor,
          lineWidth: 1 / config.ZOOM,
        });
      }
    });

    ctx.translate(-x, -y);
  }

  snapshot(why, cb) {
    console.log(`snapshot: ${why}`);
    const action = new Update_layer_action(this, why, cb);
    app.State.do_action(action);
  }

  undoredo(why, doit, undo) {
    console.log(`undoredo: ${why}`);
    const action = new Generic_action(this, { why, doit, undo });
    app.State.do_action(action);
  }

  /**
   * do actual crop
   */
  async on_params_update(event) {
    switch (event.key) {
      case 'dw_cut':
        await this.cut();
        break;
      case 'dw_crop':
        await this.crop();
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
    console.log(`fill selection with background color: ${fillColor}`);

    const imageLayers = config.layers.filter((l) => l.type === 'image');
    if (!imageLayers.length) {
      alertify.error('No image layers found');
      return;
    }

    const actions = [];

    // for each image layer, fill the selection with the background color
    imageLayers.forEach((link) => {
      const { x, y, width, height, width_original, height_original } = link;
      console.log('cut', {
        x,
        y,
        width,
        height,
        width_original,
        height_original,
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;

      // copy the original image to the canvas
      ctx.translate(x, y);
      ctx.drawImage(link.link, 0, 0);

      // draw the clipping path
      ctx.beginPath();
      ctx.moveTo(this.data[0].x, this.data[0].y);
      this.data.forEach((point) => ctx.lineTo(point.x, point.y));
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
      console.log(
        `cropping image ${link.id} to ${cropWidth}x${cropHeight}, width_ratio=${link.width / link.width_original}`,
      );
      ctx.translate(-cropLeft - x, -cropTop);
      ctx.drawImage(link.link, 0, 0);
      ctx.translate(0, 0);

      // crop everything outside the polygon
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = config.COLOR;
      ctx.beginPath();
      ctx.moveTo(data[0].x, data[0].y);
      data.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
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
          width_original: link.width_original,
          height_original: link.height_original,
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
        console.log(`deleting layer ${l.id}, ${l.name}`);
        actions.push(new app.Actions.Delete_layer_action(l.id));
      });
  }

  mousePoint(e) {
    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return null;

    return {
      x: mouse.x,
      y: mouse.y,
    };
  }

  placePointAtClickLocation() {
    const currentPoint = this.mousePoint(this.state.mouseEvent);
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

  movingLastPointToMouseLocation() {
    const currentPoint = this.mousePoint(this.state.mouseEvent);
    if (!currentPoint) return false;
    if (!this.data.length) return;
    const p = this.data.at(-1);
    p.x = currentPoint.x;
    p.y = currentPoint.y;
    this.hover = { pointIndex: this.data.length - 1 };
    this.renderData();
  }

  defineStateMachine() {
    this.state = new StateMachine(Object.values(Status));
    this.state.on('stateChanged', (state) => log(`state: ${state}`));
    this.state.on('execute', (context) => context.about && log(`context: ${context.about}`));

    this.state.register({
      start: () => console.log('start'),
      beforeDraggingHoverPoint: () => {
        const currentPoint = this.mousePoint(this.state.mouseEvent);
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
      draggingHoverPoint: () => {
        const currentPoint = this.mousePoint(this.state.mouseEvent);
        if (!currentPoint) return false;

        if (this.hover?.point) {
          const point = this.hover.point;
          point.x = currentPoint.x;
          point.y = currentPoint.y;
          this.metrics.timeOfMove = Date.now();
          this.metrics.lastPointMoved = point;
          this.Base_layers.render();
        } else {
          console.log(`mousemove: no point to drag`);
        }
      },
      endDraggingHoverPoint: () => console.log('stateMachine', 'endDraggingHoverPoint'),

      drawPoints: () => {
        const currentPoint = this.mousePoint(this.state.mouseEvent);
        if (!currentPoint) return false;

        const data = this.data;
        const priorPoint = data.at(-2);
        if (!priorPoint) {
          this.placePointAtClickLocation();
          return false;
        }
        let drawPoint = false;
        const d = distance(priorPoint, currentPoint) * config.ZOOM;
        drawPoint = drawPoint || d > Settings.distanceBetweenPoints;
        if (!drawPoint && data.length > 2 && d > Settings.minimalDistanceBetweenPoints) {
          const a = Math.PI - angleOf(data.at(-3), priorPoint, currentPoint);
          drawPoint = d * a > Settings.radiusThreshold * Settings.distanceBetweenPoints;
          if (drawPoint) {
            console.log(`angle: ${a}, distance: ${d}`);
          }
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

      placeFirstPointAtMouseLocation: () => {
        const currentPoint = this.mousePoint(this.state.mouseEvent);
        if (!currentPoint) return false;
        this.snapshot('before placing 1st point', () => {
          this.data = [currentPoint];
        });
      },

      placePointAtClickLocation: () => this.placePointAtClickLocation(),
      movingLastPointToMouseLocation: () => this.movingLastPointToMouseLocation(),

      moveToPriorPoint: () => moveToNextVertex(this, -1),
      moveToNextPoint: () => moveToNextVertex(this, 1),

      movePointLeft1Units: () => movePoint(this, -1, 0),
      movePointRight1Units: () => movePoint(this, 1, 0),
      movePointUp1Units: () => movePoint(this, 0, -1),
      movePointDown1Units: () => movePoint(this, 0, 1),

      movePointLeft10Units: () => movePoint(this, -10, 0),
      movePointRight10Units: () => movePoint(this, 10, 0),
      movePointUp10Units: () => movePoint(this, 0, -10),
      movePointDown10Units: () => movePoint(this, 0, 10),

      closePolygon: () => {
        // nothing to do
      },

      dataPoints: () => {
        const hasDataPoints = !!this.data.length;
        console.log('stateMachine', 'dataPoints', hasDataPoints);
        return hasDataPoints;
      },

      noDataPoints: () => !this.state.actions.dataPoints(),

      deleteHoverPoint: () => {
        const hover = !!this.hover?.pointIndex || !!this.hover?.midpointIndex;
        console.log('stateMachine', 'deleteHoverPoint', hover);
        if (hover) {
          deletePoint(this);
        }
        return hover;
      },

      hoveringOverPoint: () => {
        const currentPoint = this.mousePoint(this.state.mouseEvent);
        if (!currentPoint) return false;
        const priorHover = JSON.stringify(this.hover || null);
        const hover = (this.hover = computeHover(this.data, currentPoint));
        if (priorHover != JSON.stringify(this.hover)) {
          this.Base_layers.render();
        }
        return !!hover;
      },

      notHoveringOverPoint: () => !this.state.actions.hoveringOverPoint(),

      zoomIn: () => zoomViewport(this, 1),
      zoomOut: () => zoomViewport(this, -1),

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
        const isMidpoint = this.hover?.midpointIndex >= 0;
        let pointIndex = this.hover?.pointIndex || this.hover?.midpointIndex || this.data.length - 1;

        if (isMidpoint) {
          this.centerAt(center(this.data.at(pointIndex), this.data.at((pointIndex + 1) % this.data.length)));
        } else {
          this.centerAt(this.data[pointIndex]);
        }
        this.Base_layers.render();
      },
    });

    this.state
      .about('no data found')
      .from(Status.none)
      .goto(Status.ready)
      .when(null)
      .do(this.state.actions.noDataPoints);
    this.state.about('data found').from(Status.none).goto(Status.editing).when(null).do(this.state.actions.dataPoints);

    this.state
      .about('reset the tool when drawing')
      .from(Status.drawing)
      .goto(Status.ready)
      .when(Keyboard.Reset)
      .do(this.state.actions.reset);

    this.state
      .about('reset the tool when editing')
      .from(Status.editing)
      .goto(Status.ready)
      .when(Keyboard.Reset)
      .do(this.state.actions.reset);

    this.state
      .about('reset the tool when placing')
      .from(Status.placing)
      .goto(Status.ready)
      .when(Keyboard.Reset)
      .do(this.state.actions.reset);

    this.state
      .about('clear the interior during an edit')
      .from(Status.editing)
      .goto(Status.ready)
      .when(Keyboard.ClearInterior)
      .do(this.state.actions.cut);

    this.state
      .about('clear the exterior during an edit')
      .from(Status.editing)
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
      .about('complete the polygon')
      .from([Status.placing, Status.drawing])
      .goto(Status.editing)
      .when(Keyboard.ClosePolygon)
      .do(this.state.actions.closePolygon);

    this.state
      .about('prepare to drag this point')
      .from(Status.hover)
      .goto(Status.before_dragging)
      .when('Left+mousedown')
      .do(this.state.actions.beforeDraggingHoverPoint);

    this.state
      .about('begin dragging this point')
      .from(Status.before_dragging)
      .goto(Status.hover)
      .when('Left+mouseup')
      .do(this.state.actions.beforeDraggingHoverPoint);

    this.state
      .about('begin dragging this point')
      .from(Status.before_dragging)
      .goto(Status.dragging)
      .when('Left+mousemove')
      .do(this.state.actions.draggingHoverPoint);

    this.state
      .about('drag this point')
      .from(Status.dragging)
      .when('Left+mousemove')
      .do(this.state.actions.draggingHoverPoint);

    this.state
      .about('automatically create vertices as mouse moves')
      .from(Status.drawing)
      .when('Left+mousemove')
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
      .when('Left+mouseup')
      .do(this.state.actions.endDraggingHoverPoint);

    this.state
      .about('create the 1st point of the polygon')
      .from(Status.ready)
      .goto(Status.drawing)
      .when('Left+mousedown')
      .do(this.state.actions.placeFirstPointAtMouseLocation);

    this.state
      .about('stop placing and enter drawing mode')
      .from(Status.placing)
      .goto(Status.drawing)
      .when('Left+mousedown');

    this.state
      .about('continue moving the last point to the mouse location')
      .from(Status.placing)
      .when('mousemove')
      .do(this.state.actions.movingLastPointToMouseLocation);

    this.state
      .about('add a point to the polygon')
      .from(Status.drawing)
      .when('Left+mousedown')
      .do(this.state.actions.placePointAtClickLocation);

    this.state
      .about('zoom in when drawing')
      .from([Status.drawing, Status.editing])
      .when(Keyboard.ZoomIn)
      .do(this.state.actions.zoomIn);

    this.state
      .about('zoom out when drawing')
      .from([Status.drawing, Status.editing])
      .when(Keyboard.ZoomOut)
      .do(this.state.actions.zoomOut);

    this.state
      .about('set focus the the prior vertex')
      .from([Status.editing, Status.hover])
      .goto(Status.editing)
      .when(Keyboard.PriorVertex)
      .do(this.state.actions.moveToPriorPoint);

    this.state
      .about('set focus the the next vertex')
      .from([Status.editing, Status.hover])
      .goto(Status.editing)
      .when(Keyboard.NextVertex)
      .do(this.state.actions.moveToNextPoint);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointLeft)
      .do(this.state.actions.movePointLeft1Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointRight)
      .do(this.state.actions.movePointRight1Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointUp)
      .do(this.state.actions.movePointUp1Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointDown)
      .do(this.state.actions.movePointDown1Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointLeft10)
      .do(this.state.actions.movePointLeft10Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointRight10)
      .do(this.state.actions.movePointRight10Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointUp10)
      .do(this.state.actions.movePointUp10Units);

    this.state
      .about('move the point')
      .from(Status.editing)
      .when(Keyboard.MovePointDown10)
      .do(this.state.actions.movePointDown10Units);

    this.state
      .about('after deleting the last point indicate we are ready for the 1st point')
      .from(Status.editing)
      .goto(Status.ready)
      .when(Keyboard.Delete)
      .do(this.state.actions.noDataPoints);

    this.state
      .about('delete the hover point while editing (impossible?)')
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
      .when('mousemove')
      .do(this.state.actions.hoveringOverPoint);

    this.state
      .about('mouse has moved over a point (shift key is pressed)')
      .from(Status.editing)
      .goto(Status.hover)
      .when('Shift+mousemove')
      .do(this.state.actions.hoveringOverPoint);

    this.state
      .about('mouse is no longer over a point')
      .from(Status.hover)
      .goto(Status.editing)
      .when('mousemove')
      .do(this.state.actions.notHoveringOverPoint);

    this.state
      .about('mouse is no longer over a point (shift key is pressed)')
      .from(Status.hover)
      .goto(Status.editing)
      .when('Shift+mousemove')
      .do(this.state.actions.notHoveringOverPoint);
  }
}

export default DwLasso_class;

async function doActions(actions) {
  await app.State.do_action(new app.Actions.Bundle_action('dw_lasso_tool', 'Magic Crop Tool', actions));
}

function computeHover(data, currentPoint) {
  const pointIndex = data.findIndex((point) => {
    const distanceToCurrentPoint = distance(point, currentPoint);
    return distanceToCurrentPoint < Drawings.hoverMajor.size / config.ZOOM;
  });

  if (pointIndex > -1) return { pointIndex };

  // is the current point within 5 pixels of any of the midpoints of the lines?
  const midpointIndex = data.findIndex((point, i) => {
    const nextPoint = data[(i + 1) % data.length];
    const centerPoint = center(point, nextPoint);
    const distanceToCurrentPoint = distance(centerPoint, currentPoint);
    return distanceToCurrentPoint < Drawings.hoverMinor.size / config.ZOOM;
  });

  if (midpointIndex > -1) {
    return { midpointIndex };
  }

  return null;
}

function movePoint(lasso, dx, dy) {
  const scale = 1 / config.ZOOM;

  const isMidpoint = lasso.hover?.midpointIndex >= 0;
  let pointIndex = lasso.hover?.pointIndex || lasso.hover?.midpointIndex || 0;

  if (dx || dy) {
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
    point.x += dx * scale;
    point.y += dy * scale;
    lasso.metrics.timeOfMove = Date.now();
    lasso.metrics.lastPointMoved = point;
    lasso.Base_layers.render();
  }
}

function moveToNextVertex(lasso, indexOffset) {
  if (!indexOffset) return;

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

function zoomViewport(lasso, zoom) {
  if (!zoom) return;
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

function deletePoint(lasso) {
  const isMidpoint = lasso.hover?.midpointIndex >= 0;
  if (isMidpoint) {
    console.log(`deletePoint: cannot delete midpoint`);
  }

  let pointIndex = lasso.hover?.pointIndex || lasso.hover?.midpointIndex || 0;

  lasso.snapshot('before deleting point', () => {
    lasso.data.splice(pointIndex, 1);
  });
  lasso.Base_layers.render();
}

let __priorLogMessage = '';
function log(message) {
  if (__priorLogMessage === message) return;
  __priorLogMessage = message;
  //alertify.success(message);
}

new Tests().tests();
