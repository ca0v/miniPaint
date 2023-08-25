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
import { Base_action } from '../actions/base.js';
import Base_state_class from '../core/base-state.js';
import zoomView from './../libs/zoomView.js';

const Status = Object.freeze({
  none: 'none',
  ready: 'ready',
  drawing: 'drawing',
  placing: 'placing',
  editing: 'editing',
  hover: 'hover',
  dragging: 'dragging',
  before_dragging: 'before_dragging',
  done: 'done',
});

const Drawings = Object.freeze({
  major: { color: '#ffffffa0', size: 5 },
  minor: { color: '#1f1f1fa0', size: 3 },
  hoverMajor: { color: '#00ff0010', size: 20 },
  hoverMinor: { color: '#00ff0010', size: 20 },
  defaultStrokeColor: '#000000ff',
  fill: { color: '#ffffff01', exclusionColor: '#00000020' },
});

const Keyboard = Object.freeze({
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  CenterAt: 'c',
  Delete: 'Delete',
  ZoomIn: '+',
  ZoomOut: '-',
  Reset: 'Escape',
  ClearInterior: 'Shift+X',
  ClearExterior: 'x',
  ClosePolygon: ' ',
});

const Settings = Object.freeze({
  distanceBetweenPoints: 64,
  minimalDistanceBetweenPoints: 8,
  radiusThreshold: Math.PI / 16,
});

class Generic_action extends Base_action {
  constructor(cropper, { why, doit, undo }) {
    super('generic_magic_crop_action', 'Magic Crop Changes');
    this.cropper = cropper; //not used
    this._why = why;
    this._doit = doit;
    this._undo = undo;
  }

  async do() {
    super.do();
    console.log(`generic do: ${this._why}`);
    this._doit();
    this.cropper.Base_layers.render();
    dump(this.cropper);
  }

  async undo() {
    console.log(`generic undo: ${this._why}`);
    this._undo();
    super.undo();
    this.cropper.Base_layers.render();
    dump(this.cropper);
  }
}

class Update_layer_action extends Base_action {
  constructor(cropper, about = 'no description provided', cb = null) {
    super('update_magic_crop_data', 'Magic Crop Changes');
    this.cropper = cropper;
    this.about = about;
    this.cb = cb;

    this.cropperState = {
      isRedo: false,
      do: {
        data: deep(this.cropper.data),
        status: this.cropper.status,
      },
      undo: {
        data: null,
        status: '',
      },
    };
  }

  async do() {
    super.do();
    console.log(`do: ${this.about}`);
    if (this.cb) {
      if (this.cropperState.isRedo) {
        this.cropper.data = deep(this.cropperState.do.data);
        this.cropper.status = this.cropperState.do.status;
      }
      this.cb();
      this.cropper.Base_layers.render();
    } else if (this.cropperState.isRedo) {
      this.cropper.data = deep(this.cropperState.undo.data);
      this.cropper.status = this.cropperState.undo.status;
      this.cropper.Base_layers.render();
    } else {
      // nothing to do
    }
    dump(this.cropper);
  }

  async undo() {
    this.cropperState.isRedo = true;
    console.log(`undo: ${this.about}`);
    this.cropperState.undo.data = deep(this.cropper.data);
    this.cropperState.undo.status = deep(this.cropper.status);
    this.cropper.data = deep(this.cropperState.do.data);
    this.cropper.Base_layers.render();
    super.undo();
    dump(this.cropper);
  }

  free() {
    super.free();
  }
}

class EventManager {
  constructor() {
    this.ops = {};
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
      const op = (e) => {
        this.events[event].forEach((callback) => {
          callback(e);
        });
      };
      document.addEventListener(event, op);
      this.ops[event] = op;
    }
    this.events[event].push(callback);
  }

  off() {
    Object.keys(this.ops).forEach((eventName) => document.removeEventListener(eventName, this.ops[eventName]));
    this.ops = [];
    this.events = {};
  }
}

class MagicCrop_class extends Base_tools_class {
  // define getter and setter for status
  get status() {
    return this._status;
  }

  set status(value) {
    console.log(`status: ${this._status} -> ${value}`);
    if (this._status !== value) {
      alertify.success(`status: ${this._status} -> ${value}`);
      this._status = value;
    }
  }

  constructor(ctx) {
    super();
    this.metrics = {
      timeOfClick: Date.now(),
      timeOfMove: Date.now(),
    };
    this.status = Status.none;
    this.events = new EventManager();
    this.Base_layers = new Base_layers_class();
    this.Base_state = new Base_state_class();
    this.GUI_preview = new GUI_preview_class();
    this.Base_gui = new Base_gui_class();
    this.GUI_tools = new GUI_tools_class();
    this.ctx = ctx;
    this.data = [];
    this.name = 'magic_crop';
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
    this.mousedown_selection = null;
    this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);

    this.delayedSnapshot = debounce((about) => {
      console.log(`delayedSnapshot: ${about}`);
      this.snapshot(about);
    }, 300);
  }

  load() {
    this.status = Status.none;
  }

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

  keydown(e) {
    const keyboardState = computeKeyboardState(e);

    switch (this.status) {
      case Status.editing:
      case Status.hover: {
        const scale = 1 / config.ZOOM;
        let dx = 0;
        let dy = 0;
        let indexOffset = 0;

        const isMidpoint = this.hover?.midpointIndex >= 0;
        let pointIndex = this.hover?.pointIndex || this.hover?.midpointIndex || 0;

        let zoom = 0;
        switch (keyboardState) {
          case 'Alt+Shift+ArrowLeft':
            dx -= 1;
            break;

          case 'Alt+Shift+ArrowRight':
            dx += 1;
            break;

          case 'Alt+Shift+ArrowUp':
            dy -= 1;
            break;

          case 'Alt+Shift+ArrowDown':
            dy += 1;
            break;

          case 'Ctrl+Alt+Shift+ArrowLeft':
            dx -= 10;
            break;

          case 'Ctrl+Alt+Shift+ArrowRight':
            dx += 10;
            break;

          case 'Ctrl+Alt+Shift+ArrowUp':
            dy -= 10;
            break;

          case 'Ctrl+Alt+Shift+ArrowDown':
            dy += 10;
            break;

          case 'Shift+ArrowLeft':
            dx -= scale;
            break;

          case 'Shift+ArrowRight':
            dx += scale;
            break;

          case 'Shift+ArrowUp':
            dy -= scale;
            break;

          case 'Shift+ArrowDown':
            dy += scale;
            break;

          case 'Ctrl+Shift+ArrowLeft':
            dx -= 10 * scale;
            break;

          case 'Ctrl+Shift+ArrowRight':
            dx += 10 * scale;
            break;

          case 'Ctrl+Shift+ArrowUp':
            dy -= 10 * scale;
            break;

          case 'Ctrl+Shift+ArrowDown':
            dy += 10 * scale;
            break;

          case Keyboard.Reset: {
            this.reset();
            break;
          }

          case Keyboard.ClearInterior: {
            this.cut();
            break;
          }

          case Keyboard.ClearExterior: {
            this.crop();
            break;
          }

          case Keyboard.CenterAt: {
            if (isMidpoint) {
              this.centerAt(center(this.data.at(pointIndex), this.data.at((pointIndex + 1) % this.data.length)));
            } else {
              this.centerAt(this.data[pointIndex]);
            }
            break;
          }

          case Keyboard.ArrowLeft:
          case Keyboard.ArrowUp:
            indexOffset--;
            break;
          case Keyboard.ArrowRight:

          case Keyboard.ArrowDown:
            indexOffset++;
            break;

          case Keyboard.ZoomIn:
            // zoom in
            zoom++;
            break;

          case Keyboard.ZoomOut:
            // zoom out
            zoom--;
            break;

          case Keyboard.Delete:
            // delete the point
            if (!isMidpoint) {
              this.snapshot('before deleting point', () => {
                this.data.splice(pointIndex, 1);
              });
            }

          default: {
            console.log(`keydown: unknown keyboard state '${keyboardState}'`);
            break;
          }
        }
        if (zoom) {
          this.undoredo(
            'before zooming',
            () => {
              this.GUI_preview.zoom(zoom);
            },
            () => {
              this.GUI_preview.zoom(-zoom);
            },
          );
        }

        if (indexOffset) {
          if (isMidpoint) {
            pointIndex += indexOffset;
            if (indexOffset < 0) pointIndex++;

            this.hover = {
              pointIndex: (pointIndex + this.data.length) % this.data.length,
            };
          } else {
            pointIndex += indexOffset;
            if (indexOffset > 0) pointIndex--;

            this.hover = {
              midpointIndex: (pointIndex + this.data.length) % this.data.length,
            };
          }
        }

        if (dx || dy) {
          if (isMidpoint) {
            // create the point an select the new point
            const index = this.hover.midpointIndex;
            const point = center(this.data.at(index), this.data.at((index + 1) % this.data.length));
            point.x += dx;
            point.y += dy;
            this.snapshot('before moving point', () => {
              this.data.splice(index + 1, 0, point);
            });
            this.hover = { pointIndex: index + 1 };
          } else {
            this.delayedSnapshot('point moved');
            const point = this.data.at(pointIndex);
            point.x += dx;
            point.y += dy;
          }
          this.metrics.timeOfMove = Date.now();
        }

        this.Base_layers.render();
        break;
      }

      case Status.drawing:
      case Status.placing: {
        switch (keyboardState) {
          case Keyboard.Reset: {
            this.reset();
            break;
          }

          case Keyboard.ClosePolygon: {
            this.status = Status.editing;
            break;
          }

          default: {
            console.log(`keydown: keyboard state ${keyboardState}`);
            break;
          }
        }
        break;
      }
      default: {
        console.log(`keydown: unknown status ${this.status}`);
        break;
      }
    }
  }

  dblclick(e) {
    console.log(`doubleClick: status '${this.status}'`);
    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    const simplifiedData = new Smooth().smooth(removeColinearPoints(this.data));
    if (simplifiedData.length != this.data.length) {
      this.snapshot(`before removing colinear points`, () => {
        this.data = deep(simplifiedData);
      });
    }

    switch (this.status) {
      case Status.drawing:
      case Status.placing: {
        const currentStatus = this.status;
        this.undoredo(
          `before entering edit mode`,
          () => (this.status = Status.editing),
          () => (this.status = currentStatus),
        );
        break;
      }
      case Status.editing:
      case Status.hover: {
        // delete the hover point
        const hoverPointIndex = computeHover(this.data, currentPoint)?.pointIndex;
        if (hoverPointIndex >= 0) {
          this.undoredo(
            'before deleting point',
            () => {
              this.data.splice(hoverPointIndex, 1);
              if (!this.data.length) {
                this.status = Status.ready;
              }
            },
            () => {
              this.data.splice(hoverPointIndex, 0, currentPoint);
              this.status = Status.editing;
            },
          );
        }
        break;
      }
      default: {
        console.log(`doubleClick: unknown status ${this.status}`);
        break;
      }
    }
    // save data
    localStorage.setItem('magic_crop_data', JSON.stringify(this.data));
  }

  mousedown(e) {
    {
      const timeSinceLastClick = Date.now() - this.metrics.timeOfClick;
      this.metrics.timeOfClick = Date.now();
      if (timeSinceLastClick < 300) return;
    }

    console.log(`mousedown: status '${this.status}'`);

    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    switch (this.status) {
      case Status.hover: {
        this.status = Status.before_dragging;
        break;
      }

      case Status.done:
      case Status.ready: {
        this.snapshot('before placing 1st point', () => {
          this.data = [currentPoint];
          this.status = Status.drawing;
        });
        break;
      }

      case Status.placing: {
        this.undoredo(
          `before placing point ${this.data.length + 1}`,
          () => this.data.push(currentPoint),
          () => this.data.pop(),
        );
        this.status = Status.drawing;
        break;
      }

      default: {
        console.log(`mousedown: unknown status '${this.status}'`);
        break;
      }
    }
  }

  mouseup(e) {
    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    switch (this.status) {
      case Status.dragging: {
        this.status = Status.editing;
        break;
      }
      default: {
        console.log(`mouseup: unknown status '${this.status}'`);
        break;
      }
    }
  }

  mousemove(e) {
    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    // is the current point outside the canvas?
    if (currentPoint.x < 0 || currentPoint.x > config.WIDTH || currentPoint.y < 0 || currentPoint.y > config.HEIGHT) {
      // if so, then we are not hovering over anything
      return;
    }

    const data = this.data;

    const isMouseKeyPressed = e.buttons > 0;

    switch (this.status) {
      case Status.hover: {
        const priorHover = JSON.stringify(this.hover);
        this.hover = computeHover(data, currentPoint);
        if (!this.hover) {
          this.status = Status.editing;
          this.Base_layers.render();
        }
        if (priorHover != JSON.stringify(this.hover)) {
          this.Base_layers.render();
        }
        break;
      }

      case Status.editing: {
        this.hover = computeHover(data, currentPoint);
        if (this.hover) {
          this.status = Status.hover;
          this.Base_layers.render();
        }
        break;
      }

      case Status.drawing: {
        if (data.length > 1) {
          if (!isMouseKeyPressed) {
            this.status = Status.placing;
          } else {
            const priorPoint = data.at(-2);
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
            } else {
              const p = data.at(-1);
              p.x = currentPoint.x;
              p.y = currentPoint.y;
            }
            this.renderData();

            this.delayedSnapshot(`before drawing points at location ${data.length}`);
          }
        } else {
          this.undoredo(
            `before placing 2nd point`,
            () => this.data.push(currentPoint),
            () => this.data.pop(),
          );
        }
        break;
      }

      case Status.placing: {
        if (data.length) {
          const p = data.at(-1);
          p.x = currentPoint.x;
          p.y = currentPoint.y;
          // render the line
          this.renderData();
        }
        break;
      }

      case Status.before_dragging: {
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
          this.hover.point = data.at(index + 1);
          // render the line
          this.Base_layers.render();
        }
        this.status = Status.dragging;
        break;
      }
      case Status.dragging: {
        // move the point
        if (this.hover?.point) {
          const point = this.hover.point;
          point.x = currentPoint.x;
          point.y = currentPoint.y;
          this.Base_layers.render();
        } else {
          console.log(`mousemove: no point to drag`);
        }
        break;
      }

      default: {
        console.log(`mousemove: unknown status ${this.status}`);
        break;
      }
    }
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

      if (this.hover?.pointIndex === i) {
        if (age(this.metrics.timeOfMove) < 1000) {
          dot(ctx, currentPoint, { color: Drawings.major.color });
        } else {
          size = Drawings.hoverMajor.size / config.ZOOM;
          ctx.fillStyle = Drawings.hoverMajor.color;
          // draw a circle
          circle(ctx, currentPoint, size);
          dot(ctx, currentPoint, { color: Drawings.major.color });
        }
      } else {
        // draw a circle
        circle(ctx, currentPoint, size);
        dot(ctx, currentPoint, { color: Drawings.major.color });
      }
    });

    // also, draw semi-drag points at the centerpoint of each line
    data.forEach((currentPoint, i) => {
      const nextPoint = data[(i + 1) % data.length];
      // scale down the size based on the zoom level
      let size = Drawings.minor.size / config.ZOOM;
      ctx.fillStyle = Drawings.minor.color;
      ctx.strokeStyle = Drawings.defaultStrokeColor;
      ctx.lineWidth = 1 / config.ZOOM;

      const centerPoint = center(currentPoint, nextPoint);

      if (this.hover && this.hover.midpointIndex == i) {
        ctx.fillStyle = Drawings.hoverMinor.color;
        size = Drawings.hoverMinor.size / config.ZOOM;
      }

      // draw a circle
      circle(ctx, centerPoint, size);
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
        this.reset();
        break;
      default:
        break;
    }
  }

  reset() {
    this.snapshot('before reset', () => (this.data = []));
    this.status = Status.ready;
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

    this.status = Status.done;
  }

  addDeleteToolAction(actions) {
    config.layers
      .filter((l) => l.type === this.name)
      .map((l) => {
        console.log(`deleting layer ${l.id}, ${l.name}`);
        actions.push(new app.Actions.Delete_layer_action(l.id));
      });
  }

  on_activate() {
    console.log(`on_activate: status '${this.status}'`);
    switch (this.status) {
      case Status.none: {
        this.data = []; //JSON.parse(localStorage.getItem('magic_crop_data') || '[]');
        this.status = this.data.length ? Status.editing : Status.ready;
        this.events.on('keydown', (event) => this.keydown(event));
        this.events.on('mousedown', (event) => event.shiftKey && this.dblclick(event));
        this.events.on('mousedown', (event) => this.mousedown(event));
        this.events.on('mousemove', (event) => this.mousemove(event));
        this.events.on('mouseup', (event) => this.mouseup(event));
        this.events.on('touchstart', (event) => this.mousedown(event));
        this.events.on('touchmove', (event) => this.mousemove(event));
        this.events.on('touchend', (event) => this.mouseup(event));

        this.prior_action_history_max = this.Base_state.action_history_max;
        this.Base_state.action_history_max = 1000;
        break;
      }

      case Status.placing:
      case Status.editing: {
        this.reset();
        break;
      }
    }

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
        new app.Actions.Bundle_action('new_magic_crop_layer', 'Magic Crop Layer', [
          new app.Actions.Insert_layer_action(layer),
        ]),
      );
      this.params_hash = params_hash;
    } else {
      this.renderData();
    }
  }

  on_leave() {
    console.log(`on_leave: status '${this.status}'`);
    this.events.off();
    this.status = Status.none;

    this.Base_state.action_history_max = this.prior_action_history_max;

    // delete the magic crop layer
    const actions = [new app.Actions.Reset_selection_action()];
    this.addDeleteToolAction(actions);
    return actions;
  }

  mousePoint(e) {
    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return null;

    return {
      x: mouse.x,
      y: mouse.y,
    };
  }
}

export default MagicCrop_class;

async function doActions(actions) {
  await app.State.do_action(new app.Actions.Bundle_action('magic_crop_tool', 'Magic Crop Tool', actions));
}

function circle(ctx, center, size) {
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.floor(size / 2) + 1, 0, 2 * Math.PI);

  ctx.fill();
  ctx.stroke();
}

function dot(ctx, point) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 0.5, 0, 2 * Math.PI);
  ctx.stroke();
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

function center(currentPoint, nextPoint) {
  return {
    x: (currentPoint.x + nextPoint.x) / 2,
    y: (currentPoint.y + nextPoint.y) / 2,
  };
}

function removeColinearPoints(points) {
  if (points.length < 3) return points;
  const result = [];
  const n = points.length;

  result.push(points.at(0));

  for (let i = 1; i < n - 1; i++) {
    const priorPoint = result.at(-1);
    const currentPoint = points.at(i);
    const nextPoint = points.at(i + 1);
    const priorDistance = distance(priorPoint, currentPoint);
    const nextDistance = distance(currentPoint, nextPoint);
    const totalDistance = distance(priorPoint, nextPoint);

    if (priorDistance + nextDistance > totalDistance) {
      result.push(currentPoint);
    } else {
      //colinear
    }
  }

  const lastPoint = points.at(-1);
  if (distance(lastPoint, result.at(-1))) {
    result.push(lastPoint);
  }

  return result;
}

function getBoundingBox(points) {
  const result = {
    top: Number.MAX_SAFE_INTEGER,
    left: Number.MAX_SAFE_INTEGER,
    bottom: Number.MIN_SAFE_INTEGER,
    right: Number.MIN_SAFE_INTEGER,
  };
  points.forEach((point) => {
    if (point.x < result.left) result.left = point.x;
    if (point.x > result.right) result.right = point.x;
    if (point.y < result.top) result.top = point.y;
    if (point.y > result.bottom) result.bottom = point.y;
  });
  return result;
}

function distance(p1, p2) {
  const dist_x = p1.x - p2.x;
  const dist_y = p1.y - p2.y;
  return Math.sqrt(dist_x * dist_x + dist_y * dist_y);
}

function deep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function age(time) {
  return Date.now() - time;
}

function angleOf(p1, p2, p3) {
  const a = distance(p1, p2);
  const b = distance(p2, p3);
  const c = distance(p1, p3);
  return Math.acos((a * a + b * b - c * c) / (2 * a * b));
}

function computeKeyboardState(e) {
  const { key, ctrlKey, altKey, shiftKey } = e;
  return `${ctrlKey ? 'Ctrl+' : ''}${altKey ? 'Alt+' : ''}${shiftKey ? 'Shift+' : ''}${key}`;
}

function dump(cropper) {
  console.log(`status: ${cropper.status}`);
  console.log(`data: ${cropper.data.map((d) => `${Math.floor(d.x)},${Math.floor(d.y)}`)}`);
}

function debounce(func, wait = 50, immediate = false) {
  let timeout;
  return function () {
    const context = this,
      args = arguments;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

function clockwise(data) {
  // if the data is counterclockwise, reverse it
  const sum = data.reduce((sum, point, i) => {
    const nextPoint = data[(i + 1) % data.length];
    return sum + (nextPoint.x - point.x) * (nextPoint.y + point.y);
  }, 0);

  if (sum < 0) {
    return data.toReversed();
  }

  return data;
}

class Smooth {
  smooth(data) {
    if (data.length < 3) return data;

    // generate new points which fit the data using a bezier curve
    const result = [];

    for (let i = 0; i < data.length; i++) {
      const p1 = data.at((i - 1 + data.length) % data.length);
      const p2 = data.at((i + 0) % data.length);
      const p3 = data.at((i + 1) % data.length);

      try {
        const circle = this.centerOfCircle(p1, p2, p3);
        const angle1 = this.radianOfPoint(circle, center(p1, p2));
        const angle2 = this.radianOfPoint(circle, center(p2, p3));
        result.push(this.arcPoint(circle, angle1));
        result.push(p2);
        result.push(p2);
        result.push(this.arcPoint(circle, angle2));
      } catch (ex) {
        // colinear points
        result.push(p2);
        result.push(p2);
      }
    }

    const averages = [];
    // find the center of each pair of points
    for (let i = 0; i < result.length; i += 2) {
      const p1 = result.at((i + result.length) % result.length);
      const p2 = result.at((i + 1) % result.length);
      averages.push(center(p1, p2));
    }

    return averages;
  }

  centerOfCircle(p1, p2, p3) {
    // from https://stackoverflow.com/questions/4103405/what-is-the-algorithm-for-finding-the-center-of-a-circle-from-three-points
    const center = { x: 0, y: 0, r: 0 };
    const ax = (p1.x + p2.x) / 2;
    const ay = (p1.y + p2.y) / 2;
    const ux = p1.y - p2.y;
    const uy = p2.x - p1.x;
    const bx = (p2.x + p3.x) / 2;
    const by = (p2.y + p3.y) / 2;
    const vx = p2.y - p3.y;
    const vy = p3.x - p2.x;
    const dx = ax - bx;
    const dy = ay - by;
    const vu = vx * uy - vy * ux;
    if (vu == 0) throw `Points are collinear: ${JSON.stringify({ p1, p2, p3 })}`;
    const g = (dx * uy - dy * ux) / vu;
    center.x = bx + g * vx;
    center.y = by + g * vy;
    center.r = Math.sqrt((p1.x - center.x) ** 2 + (p1.y - center.y) ** 2);
    return center;
  }

  radianOfPoint(circle, point) {
    const a = Math.atan2(point.y - circle.y, point.x - circle.x);
    return a < 0 ? a + 2 * Math.PI : a;
  }

  arcPoint(circle, angle) {
    const x = circle.x + circle.r * Math.cos(angle);
    const y = circle.y + circle.r * Math.sin(angle);
    return { x, y };
  }
}

function diff(array1, array2) {
  const result = [];
  array1.forEach((item, i) => {
    if (item.x !== array2[i].x || item.y !== array2[i].y) {
      result.push({ index: i, item1: item, item2: array2[i] });
    }
  });
  return result;
}

class Tests {
  tests() {
    const vision = new Smooth();

    {
      vision.arcPoint; // tests

      const circle = { x: 0, y: 0, r: 1 };
      this.eq(1, vision.arcPoint(circle, 0).x, 'A circle at origin with radius 1 at 0 degrees should be at (1,0)');

      this.eq(0, vision.arcPoint(circle, 0).y, 'A circle at origin with radius 1 at 0 degrees should be at (1,0)');

      {
        this.eq(
          0,
          vision.arcPoint(circle, Math.PI / 2).x,
          `A circle at origin with radius 1 at 90 degrees should be at (0,_)`,
        );
      }

      this.eq(
        1,
        vision.arcPoint(circle, Math.PI / 2).y,
        'A circle at origin with radius 1 at 90 degrees should be at (_,1)',
      );
    }

    {
      vision.radianOfPoint; // tests

      const circle = { x: 0, y: 0, r: 1 };
      this.eq(
        0,
        vision.radianOfPoint(circle, { x: 1, y: 0 }),
        'A circle at origin with radius 1 at (1,0) should be at 0 degrees',
      );

      this.eq(
        Math.PI / 2,
        vision.radianOfPoint(circle, { x: 0, y: 1 }),
        'A circle at origin with radius 1 at (0,1) should be at 90 degrees',
      );

      this.eq(
        Math.PI,
        vision.radianOfPoint(circle, { x: -1, y: 0 }),
        'A circle at origin with radius 1 at (-1,0) should be at 180 degrees',
      );

      this.eq(
        (3 * Math.PI) / 2,
        vision.radianOfPoint(circle, { x: 0, y: -1 }),
        'A circle at origin with radius 1 at (0,-1) should be at 270 degrees',
      );
    }

    {
      vision.centerOfCircle; // tests

      let circle = vision.centerOfCircle({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
      this.eq(0, circle.x, 'The center of a circle with points (0,0), (1,0), (0,1) should be at (0,_)');
      this.eq(0, circle.y, 'The center of a circle with points (0,0), (1,0), (0,1) should be at (_,0)');
      this.eq(1, circle.r, 'The radius of a circle with points (0,0), (1,0), (0,1) should be 1');
    }

    {
      vision.smooth; // tests

      const p0 = { x: 0, y: 0 };
      const p1 = { x: 1, y: 0 };
      const p2 = { x: 0, y: 1 };
      const p3 = { x: -1, y: 1 };
      const p4 = { x: -2, y: 1 };

      this.eq(0, vision.smooth([]).length, 'The result should be empty');
      this.eq(1, vision.smooth([p0]).length, 'The result should be a single point');
      this.eq(2, vision.smooth([p0, p0]).length, 'The result should be the same two points');
      this.eq(
        6,
        vision.smooth([p0, p1, p2]).length,
        'Three interpolated points should be injected into the original set of three points',
      );

      this.eq(
        8,
        vision.smooth([p0, p1, p2, p3]).length,
        'An interpolation point was added between every non-colinear pair of points (including between the last and first)',
      );

      this.eq(
        9,
        vision.smooth([p0, p1, p2, p3, p4]).length,
        'An interpolation point was added between every non-colinear pair of points',
      );
    }
  }

  eq(expected, actual, assertion) {
    if (typeof actual === 'number') actual = actual.toFixed(6);
    if (typeof expected === 'number') expected = expected.toFixed(6);
    console.assert(
      expected === actual,
      `${assertion}: the actual value was ${actual} but the expected value was ${expected}`,
    );
  }

  radToDeg(rad) {
    return Math.round((rad * 180) / Math.PI);
  }
}

new Tests().tests();
