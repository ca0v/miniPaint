/**
 * Magic Crop Tool
 * status values: ready, drawing, placing, editing, hover, dragging, done
 * ready - tool has been initialized and is listening for 1st click
 * drawing - tool has placed a point
 * placing - user is moving mouse deciding where to place the next point
 * editing - user has closed the polygon and can now add/move/delete vertices
 * hover - user is hovering over a vertex or midpoint
 * dragging - user is dragging a vertex or midpoint
 * done - user has clicked the "Magic Crop" button, all points are cleared
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

const Drawings = {
  major: { color: '#ff000080', size: 10 },
  minor: { color: '#00ff0080', size: 6 },
  hoverMajor: { color: '#ff000010', size: 20 },
  hoverMinor: { color: '#00ff0010', size: 20 },
  defaultStrokeColor: '#ffffff',
  fill: { color: '#ffffff01', exclusionColor: '#101010c0' },
};

const Keyboard = {
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  CenterAt: 'c',
  Delete: 'Delete',
  ZoomIn: '+',
  ZoomOut: '-',
};

class Generic_action extends Base_action {
  constructor(cropper, { doit, undo }) {
    super('generic_magic_crop_action', 'Magic Crop Changes');
    this.cropper = cropper; //not used
    this.doit = doit;
    this.undo = undo;
  }

  async do() {
    super.do();
    this.doit();
  }

  async undo() {
    this.undo();
    super.undo();
  }
}

class Update_layer_action extends Base_action {
  constructor(cropper, cb) {
    super('update_magic_crop_data', 'Magic Crop Changes');
    this.cropper = cropper;
    this.cb = cb;
    this.state = deep(this.cropper.data);
  }

  async do() {
    super.do();
    if (this.cb) {
      this.cropper.data = deep(this.state);
      this.cb();
      this.cropper.Base_layers.render();
    }
  }

  async undo() {
    this.cropper.data = deep(this.state);
    this.cropper.Base_layers.render();
    super.undo();
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
    Object.keys(this.ops).forEach((eventName) =>
      document.removeEventListener(eventName, this.ops[eventName]),
    );
    this.ops = [];
    this.events = {};
  }
}

const Status = {
  none: 'none',
  ready: 'ready',
  drawing: 'drawing',
  placing: 'placing',
  editing: 'editing',
  hover: 'hover',
  dragging: 'dragging',
  done: 'done',
};

class MagicCrop_class extends Base_tools_class {
  constructor(ctx) {
    super();
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

    console.log(
      `point at: ${px}, ${py} zoom at: ${dx}, ${dy}, moving to: ${pos_global.x}, ${pos_global.y}`,
    );

    // preview top-left of point
    zoomView.move(-pos_global.x, -pos_global.y);
    zoomView.move(config.WIDTH / 2, config.HEIGHT / 2);

    // scale
    zoomView.apply();
  }

  keydown(e) {
    switch (this.status) {
      case Status.editing:
      case Status.hover: {
        let dx = 0;
        let dy = 0;
        let indexOffset = 0;

        const isMidpoint = this.hover?.midpointIndex >= 0;
        let pointIndex =
          this.hover?.pointIndex || this.hover?.midpointIndex || 0;

        if (e.shiftKey) {
          switch (e.key) {
            // arrow left
            case 'ArrowLeft':
              --dx;
              break;
            case 'ArrowRight':
              ++dx;
              break;
            case 'ArrowUp':
              --dy;
              break;
            case 'ArrowDown':
              ++dy;
              break;
            default:
              break;
          }
          if (dx || dy) {
            const scale = (e.ctrlKey ? 10 : 1) / (e.altKey ? 1 : config.ZOOM);
            if (isMidpoint) {
              // create the point an select the new point
              const index = this.hover.midpointIndex;
              const point = center(
                this.data.at(index),
                this.data.at((index + 1) % this.data.length),
              );
              point.x += dx * scale;
              point.y += dy * scale;
              this.snapshot('before moving point', () => {
                this.data.splice(index + 1, 0, point);
              });
              this.hover = { pointIndex: index + 1 };
            } else {
              this.snapshot('before moving point', () => {
                const point = this.data.at(pointIndex);
                point.x += dx * scale;
                point.y += dy * scale;
              });
            }
          }
        } else {
          let zoom = 0;
          switch (e.key) {
            case Keyboard.CenterAt: {
              this.centerAt(this.data[pointIndex]);
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
                midpointIndex:
                  (pointIndex + this.data.length) % this.data.length,
              };
            }
          }
          this.Base_layers.render();
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

    const data = this.data;

    switch (this.status) {
      case Status.drawing:
      case Status.placing: {
        // simplify the path
        // this.data = removeColinearPoints(data); causing issues
        this.renderData();
        this.status = Status.editing;
        break;
      }
      case Status.editing:
      case Status.hover: {
        // delete the hover point
        const hoverPointIndex = computeHover(data, currentPoint)?.pointIndex;
        if (hoverPointIndex >= 0) {
          this.snapshot('before deleting point', () => {
            this.data.splice(hoverPointIndex, 1);
          });
          if (!data.length) {
            this.status = Status.ready;
          }
        }
        break;
      }
      default: {
        console.log(`doubleClick: unknown status ${this.status}`);
        break;
      }
    }
    // save data
    //localStorage.setItem('magic_crop_data', JSON.stringify(data));
  }

  mousedown(e) {
    {
      const timeOfLastClick = this.timeOfClick || 0;
      this.timeOfClick = Date.now();
      const timeSinceLastClick = this.timeOfClick - timeOfLastClick;
      if (timeSinceLastClick < 300) return;
    }

    console.log(`mousedown: status '${this.status}'`);

    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    switch (this.status) {
      case Status.hover: {
        this.status = Status.dragging;
        break;
      }

      case Status.done:
      case Status.ready: {
        this.data = [currentPoint];
        this.status = Status.drawing;
        break;
      }

      case Status.placing: {
        this.snapshot('before placing', () => {
          this.data.push(currentPoint);
        });
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

    const data = this.data;

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
          this.status = Status.placing;
        } else {
          data.push(currentPoint);
          this.renderData();
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

      case Status.dragging: {
        // move the point
        if (this.hover?.pointIndex >= 0) {
          const index = this.hover.pointIndex;
          const point = data.at(index);
          point.x = currentPoint.x;
          point.y = currentPoint.y;
          // render the line
          this.Base_layers.render();
        } else if (this.hover?.midpointIndex >= 0) {
          const index = this.hover.midpointIndex;
          // insert current point after this index
          data.splice(index + 1, 0, currentPoint);
          this.hover = { pointIndex: index + 1 };
          // render the line
          this.Base_layers.render();
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
    console.log('TODO: undo/redo state');
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
    ctx.moveTo(pointData[0].x, pointData[0].y);
    [...pointData].reverse().forEach((point) => {
      ctx.lineTo(point.x, point.y);
    });
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

      if (this.hover && this.hover.pointIndex === i) {
        size = Drawings.hoverMajor.size;
        ctx.fillStyle = Drawings.hoverMajor.color;
      }
      // draw a circle
      circle(ctx, currentPoint, size);
      dot(ctx, currentPoint, { color: Drawings.major.color });
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
        size = Drawings.hoverMinor.size;
      }

      // draw a circle
      circle(ctx, centerPoint, size);
    });

    ctx.translate(-x, -y);
  }

  snapshot(why, cb) {
    console.log(`snapshot: ${why}`);
    const action = new Update_layer_action(this, cb);
    app.State.do_action(action);
  }

  undoredo(why, doit, undo) {
    console.log(`undoredo: ${why}`);
    const action = new Generic_action(this, { doit, undo });
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
      default:
        break;
    }
  }

  async cut() {
    const fillColor = config.COLOR;
    console.log(`fill selection with background color: ${fillColor}`);

    const imageLayers = config.layers.filter((l) => l.type === 'image');

    const actions = [];

    // for each image layer, fill the selection with the background color
    imageLayers.forEach((link) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = config.WIDTH;
      canvas.height = config.HEIGHT;

      // copy the original image to the canvas
      ctx.drawImage(link.link, 0, 0);

      // draw the clipping path
      ctx.beginPath();
      ctx.moveTo(this.data[0].x, this.data[0].y);
      this.data.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.clip();

      // fill the canvas with the background color
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // update the link with the new image
      actions.push(new app.Actions.Update_layer_image_action(canvas, link.id));
    });

    // clear the data and reset the state
    this.snapshot('before cutting', () => (this.data = []));
    this.status = Status.ready;

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

    imageLayers.forEach((link) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      //cut required part
      ctx.translate(-cropLeft, -cropTop);
      ctx.drawImage(link.link, 0, 0);
      ctx.translate(0, 0);

      // create a image mask to hide the parts of the image that are not inside the polygon defined by the data
      const maskCanvas = document.createElement('canvas');
      const maskCtx = maskCanvas.getContext('2d');
      maskCanvas.width = config.WIDTH;
      maskCanvas.height = config.HEIGHT;
      maskCtx.fillStyle = '#000000';
      maskCtx.beginPath();

      maskCtx.moveTo(data[0].x, data[0].y);

      for (let i = 1; i < data.length; i++) {
        const point = data.at(i);
        if (point === null) {
          maskCtx.closePath();
          maskCtx.fill();
          maskCtx.beginPath();
        } else {
          maskCtx.lineTo(point.x, point.y);
        }
      }
      maskCtx.closePath();
      maskCtx.fill();

      // apply the mask
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0);

      actions.push(new app.Actions.Update_layer_image_action(canvas, link.id));

      actions.push(
        new app.Actions.Update_layer_action(link.id, {
          x: 0,
          y: 0,
          width: cropWidth,
          height: cropHeight,
          width_original: cropWidth,
          height_original: cropHeight,
        }),
      );
    });

    actions.push(
      new app.Actions.Prepare_canvas_action('undo'),
      new app.Actions.Update_config_action({
        WIDTH: cropWidth,
        HEIGHT: cropHeight,
      }),
      new app.Actions.Prepare_canvas_action('do'),
    );

    // delete the magic crop layer
    this.addDeleteToolAction(actions);

    actions.push(new app.Actions.Reset_selection_action());
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
      case Status.none:
        this.data = JSON.parse(localStorage.getItem('magic_crop_data') || '[]');
        this.status = this.data.length ? Status.editing : Status.ready;
        this.events.on('keydown', (event) => this.keydown(event));
        this.events.on('dblclick', (event) => this.dblclick(event));
        this.events.on('mousedown', (event) => this.mousedown(event));
        this.events.on('mousemove', (event) => this.mousemove(event));
        this.events.on('mouseup', (event) => this.mouseup(event));
        this.events.on('touchstart', (event) => this.mousedown(event));
        this.events.on('touchmove', (event) => this.mousemove(event));
        this.events.on('touchend', (event) => this.mouseup(event));

        this.prior_action_history_max = this.Base_state.action_history_max;
        this.Base_state.action_history_max = 1000;
    }

    const params_hash = this.get_params_hash();
    const opacity = Math.round((config.ALPHA / 255) * 100);

    if (config?.layer?.type != this.name || params_hash != this.params_hash) {
      //register new object - current layer is not ours or params changed
      const layer = {
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
        new app.Actions.Bundle_action(
          'new_magic_crop_layer',
          'Magic Crop Layer',
          [new app.Actions.Insert_layer_action(layer)],
        ),
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
  await app.State.do_action(
    new app.Actions.Bundle_action(
      'magic_crop_tool',
      'Magic Crop Tool',
      actions,
    ),
  );
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
  ctx.fill();
}

function computeHover(data, currentPoint) {
  const pointIndex = data.findIndex((point) => {
    const distanceToCurrentPoint = distance(point, currentPoint);
    return distanceToCurrentPoint < Drawings.major.size / config.ZOOM;
  });

  if (pointIndex > -1) return { pointIndex };

  // is the current point within 5 pixels of any of the midpoints of the lines?
  const midpointIndex = data.findIndex((point, i) => {
    const nextPoint = data[(i + 1) % data.length];
    const centerPoint = center(point, nextPoint);
    const distanceToCurrentPoint = distance(centerPoint, currentPoint);
    return distanceToCurrentPoint < Drawings.minor.size / config.ZOOM;
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
