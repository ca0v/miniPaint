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
import Base_selection_class from '../core/base-selection.js';
import alertify from 'alertifyjs/build/alertify.min.js';

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

const configuration = {
  majorColor: '#ff000080',
  minorColor: '#00ff0080',
  hoverMajorColor: '#ff000010',
  hoverMinorColor: '#00ff0010',
  minorSize: 6,
  majorSize: 10,
  defaultStrokeColor: '#ffffff',
};

class MagicCrop_class extends Base_tools_class {
  constructor(ctx) {
    super();
    this.status = Status.none;
    this.events = new EventManager();
    this.Base_layers = new Base_layers_class();
    this.Base_gui = new Base_gui_class();
    this.GUI_tools = new GUI_tools_class();
    this.ctx = ctx;
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

  keydown(e) {
    console.log(`keydown: ${e}`);
  }

  dblclick(e) {
    const data = config.layer.data;

    switch (this.status) {
      case Status.drawing:
      case Status.placing: {
        // simplify the path
        this.renderData(removeColinearPoints(data));
        this.status = Status.editing;
        break;
      }
      case Status.editing:
      case Status.hover: {
        // delete the point
        if (this.hover?.pointIndex >= 0) {
          const index = this.hover.pointIndex;
          data.splice(index, 1);
          this.renderData(data);
        }
        break;
      }
      default: {
        console.log(`doubleClick: unknown status ${this.status}`);
        break;
      }
    }
  }

  mousedown(e) {
    {
      const timeOfLastClick = this.timeOfClick || 0;
      this.timeOfClick = Date.now();
      const timeSinceLastClick = this.timeOfClick - timeOfLastClick;
      if (timeSinceLastClick < 300) return;
    }

    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    const params_hash = this.get_params_hash();
    const opacity = Math.round((config.ALPHA / 255) * 100);

    switch (this.status) {
      case Status.hover: {
        this.status = Status.dragging;
        break;
      }

      case Status.done:
      case Status.ready: {
        if (config.layer.type != this.name || params_hash != this.params_hash) {
          //register new object - current layer is not ours or params changed
          const layer = {
            type: this.name,
            data: [currentPoint],
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
          this.renderData([currentPoint]);
        }
        this.status = Status.drawing;
        break;
      }

      case Status.placing: {
        console.log('cloning data');
        const data = deep(config.layer.data);
        data.push(currentPoint);
        this.renderData(data);
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
    switch (this.status) {
      case Status.dragging: {
        this.status = Status.editing;
        break;
      }
      default: {
        console.log(`mouseup: unknown status ${this.status}`);
        break;
      }
    }
  }

  mousemove(e) {
    const currentPoint = this.mousePoint(e);
    if (!currentPoint) return;

    const data = config.layer.data;

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
          this.renderData(data);
        }
        break;
      }

      case Status.placing: {
        if (data.length) {
          const p = data.at(-1);
          p.x = currentPoint.x;
          p.y = currentPoint.y;
          // render the line
          this.renderData(data);
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

  renderData(data) {
    console.log('update_layer_data');
    app.State.do_action(
      new app.Actions.Bundle_action(
        'update_magic_crop_layer',
        'Update Magic Crop Layer',
        [
          new app.Actions.Update_layer_action(config.layer.id, {
            data,
          }),
        ],
      ),
    );
  }

  render(ctx, layer) {
    this.drawTool(ctx, layer);
  }

  /**
   * draw without antialiasing, sharp, ugly mode.
   *
   * @param {object} ctx
   * @param {object} layer
   */
  drawTool(ctx, layer) {
    const { x, y, color, params } = layer;

    // scale down the size based on the zoom level
    const size = (params.size || 1) / config.ZOOM;

    const layerData = removeColinearPoints(layer.data);

    //set styles
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.translate(x, y);

    const firstPoint = layerData.at(0);

    ctx.beginPath();
    try {
      ctx.moveTo(firstPoint.x, firstPoint.y);
      layerData.forEach((_, i) => {
        const nextPoint = layerData.at((i + 1) % layerData.length);
        ctx.lineTo(nextPoint.x, nextPoint.y);
      });
    } finally {
      ctx.closePath();
      ctx.stroke();
    }

    // now render the drag-points over the top of the lines
    layerData.forEach((currentPoint, i) => {
      ctx.fillStyle = configuration.majorColor;

      // the circle should have an outline
      ctx.strokeStyle = configuration.defaultStrokeColor;
      ctx.lineWidth = 1 / config.ZOOM;

      // scale down the size based on the zoom level
      let size = configuration.majorSize / config.ZOOM;

      if (this.hover && this.hover.pointIndex === i) {
        size *= 1.5;
        ctx.fillStyle = configuration.hoverMajorColor;
      }
      // draw a circle
      circle(ctx, currentPoint, size);
      dot(ctx, currentPoint, { color: configuration.majorColor });
    });

    // also, draw semi-drag points at the centerpoint of each line
    layerData.forEach((currentPoint, i) => {
      const nextPoint = layerData[(i + 1) % layerData.length];
      // scale down the size based on the zoom level
      let size = configuration.minorSize / config.ZOOM;
      ctx.fillStyle = configuration.minorColor;
      ctx.strokeStyle = configuration.defaultStrokeColor;
      ctx.lineWidth = 1 / config.ZOOM;

      const centerPoint = center(currentPoint, nextPoint);

      if (this.hover && this.hover.midpointIndex == i) {
        ctx.fillStyle = configuration.hoverMinorColor;
        size *= 1.5;
      }

      // draw a circle
      circle(ctx, centerPoint, size);
    });

    ctx.translate(-x, -y);
  }

  /**
   * do actual crop
   */
  async on_params_update() {
    const params = this.getParams();
    params.magic_crop = true;
    this.GUI_tools.show_action_attributes();

    const actions = [];

    const data = config.layer.data;
    if (data.length == 0) return;

    const bbox = getBoundingBox(data);
    const cropWidth = bbox.right - bbox.left;
    const cropHeight = bbox.bottom - bbox.top;
    const cropTop = bbox.top;
    const cropLeft = bbox.left;

    config.layers.forEach((link) => {
      if (link.type == null) return;

      if (link.type == 'image') {
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

        actions.push(
          new app.Actions.Update_layer_image_action(canvas, link.id),
        );

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
      }
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
    actions.push(
      new app.Actions.Delete_layer_action(config.layer.id),
      new app.Actions.Reset_selection_action(),
    );

    await app.State.do_action(
      new app.Actions.Bundle_action(
        'magic_crop_tool',
        'Magic Crop Tool',
        actions,
      ),
    );

    this.status = Status.done;
  }

  on_activate() {
    console.log(`on_activate: status '${this.status}'`);
    switch (this.status) {
      case Status.none:
        this.status = Status.ready;
        this.events.on('keydown', (event) => this.keydown(event));
        this.events.on('dblclick', (event) => this.dblclick(event));
        this.events.on('mousedown', (event) => this.mousedown(event));
        this.events.on('mousemove', (event) => this.mousemove(event));
        this.events.on('mouseup', (event) => this.mouseup(event));
        this.events.on('touchstart', (event) => this.mousedown(event));
        this.events.on('touchmove', (event) => this.mousemove(event));
        this.events.on('touchend', (event) => this.mouseup(event));
    }
  }

  on_leave() {
    console.log(`on_leave: status '${this.status}'`);
    this.events.off();
    this.status = Status.none;
    // delete the magic crop layer
    return [
      new app.Actions.Delete_layer_action(config.layer.id),
      new app.Actions.Reset_selection_action(),
    ];
  }

  mousePoint(e) {
    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return null;
    return {
      x: Math.ceil(mouse.x - config.layer.x),
      y: Math.ceil(mouse.y - config.layer.y),
    };
  }
}

export default MagicCrop_class;

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
    return distanceToCurrentPoint < configuration.majorSize / config.ZOOM;
  });

  if (pointIndex > -1) return { pointIndex };

  // is the current point within 5 pixels of any of the midpoints of the lines?
  const midpointIndex = data.findIndex((point, i) => {
    const nextPoint = data[(i + 1) % data.length];
    const centerPoint = center(point, nextPoint);
    const distanceToCurrentPoint = distance(centerPoint, currentPoint);
    return distanceToCurrentPoint < configuration.minorSize / config.ZOOM;
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
