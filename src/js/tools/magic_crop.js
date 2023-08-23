import app from '../app.js';
import config from '../config.js';
import Base_tools_class from '../core/base-tools.js';
import Base_layers_class from '../core/base-layers.js';
import GUI_tools_class from '../core/gui/gui-tools.js';
import Base_gui_class from '../core/base-gui.js';
import Base_selection_class from '../core/base-selection.js';
import alertify from 'alertifyjs/build/alertify.min.js';

const configuration = {
  majorColor: '#ff000080',
  minorColor: '#00ff0080',
  hoverMajorColor: '#ff000010',
  hoverMinorColor: '#00ff0010',
  minorSize: 6,
  majorSize: 10,
  defaultStrokeColor: '#ffffff',
};

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
      console.log(
        `removing colinear point ${currentPoint.x},${currentPoint.y}`,
      );
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

function deep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function distance(p1, p2) {
  const dist_x = p1.x - p2.x;
  const dist_y = p1.y - p2.y;
  return Math.sqrt(dist_x * dist_x + dist_y * dist_y);
}

class MagicCrop_class extends Base_tools_class {
  constructor(ctx) {
    super();
    var _this = this;
    this.status = '';
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
      data_function: function () {
        return _this.selection;
      },
    };
    this.mousedown_selection = null;
    this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
  }

  load() {
    this.default_events();
    document.addEventListener('dblclick', (event) => {
      this.doubleClick(event);
    });
  }

  default_dragStart(event) {
    this.is_mousedown_canvas = false;
    if (config.TOOL.name != this.name) return;
    if (!event.target.closest('#main_wrapper')) return;

    this.is_mousedown_canvas = true;
    this.mousedown(event);
  }

  // close the path and crop the image
  doubleClick(e) {
    console.log('doubleClick');
    this.status = 'done';
    config.layer.data = removeColinearPoints(config.layer.data);
    this.renderData(config.layer.data);
  }

  /**
   * When the mouse is pressed, create a new layer and draw a dot
   */
  mousedown(e) {
    // ignore double-click

    const timeOfLastClick = this.timeOfLastClick || 0;
    this.timeOfLastClick = Date.now();

    const timeSinceLastClick = this.timeOfLastClick - timeOfLastClick;
    if (timeSinceLastClick < 300) {
      console.log(`double click detected, ignoring`);
      return;
    }

    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return;

    const params_hash = this.get_params_hash();
    const opacity = Math.round((config.ALPHA / 255) * 100);

    const currentPoint = {
      x: Math.ceil(mouse.x - config.layer.x),
      y: Math.ceil(mouse.y - config.layer.y),
    };

    if (this.hover) {
      if (this.hover.pointIndex != null) {
        // mouse move will update the location of this point
        this.status = 'moving_point';
        return;
      }
      if (this.hover.midpointIndex != null) {
        this.status = 'moving_point';
        return;
      }
    }

    if (config.layer.type != this.name || params_hash != this.params_hash) {
      //register new object - current layer is not ours or params changed
      this.layer = {
        type: this.name,
        data: [],
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
        new app.Actions.Bundle_action('magic_crop_layer', 'Magic Crop Layer', [
          new app.Actions.Insert_layer_action(this.layer),
        ]),
      );
      this.params_hash = params_hash;
    }
    {
      console.log(`adding point ${currentPoint.x},${currentPoint.y}`);
      if (this.status === 'done') {
        config.layer.data = [currentPoint];
      } else {
        config.layer.data.push(currentPoint);
        // create an undo action to preserve the original data
        app.State.do_action(
          new app.Actions.Bundle_action(
            'magic_crop_layer',
            'Update Magic Crop Layer',
            [
              new app.Actions.Update_layer_action(config.layer.id, {
                data: deep(config.layer.data),
              }),
            ],
          ),
        );
      }
    }
    this.status = 'drawing';
  }

  /**
   * When the mouse moves, draw a straight line from the previous point to the current point.
   */
  mousemove(e) {
    const mouse = this.get_mouse_info(e);
    const params = this.getParams();
    if (mouse.click_valid == false) {
      return;
    }

    const data = config.layer.data;

    //add point
    const currentPoint = {
      x: Math.ceil(mouse.x - config.layer.x),
      y: Math.ceil(mouse.y - config.layer.y),
    };

    switch (this.status) {
      case 'done': {
        this.hover = null;

        // is the current point within 5 pixels of any of the points in the data?
        const pointIndex = data.findIndex((point) => {
          const distanceToCurrentPoint = distance(point, currentPoint);
          return distanceToCurrentPoint < configuration.majorSize / config.ZOOM;
        });

        if (pointIndex > -1) {
          console.log(`hovering over point ${pointIndex}`);
          this.hover = { pointIndex };
          this.renderData(data);
          return;
        }

        // is the current point within 5 pixels of any of the midpoints of the lines?
        const midpointIndex = data.findIndex((point, i) => {
          const nextPoint = data[(i + 1) % data.length];
          const centerPoint = {
            x: (point.x + nextPoint.x) / 2,
            y: (point.y + nextPoint.y) / 2,
          };
          const distanceToCurrentPoint = distance(centerPoint, currentPoint);
          return distanceToCurrentPoint < configuration.minorSize / config.ZOOM;
        });

        if (midpointIndex > -1) {
          console.log(`hovering over midpoint ${midpointIndex}`);
          this.hover = { midpointIndex };
          this.renderData(data);
          return;
        }
        break;
      }

      case 'drawing': {
        // render a line from the previous point to the current point

        if (data.length) {
          const priorPoint = data[data.length - 1];
          const distanceToCurrentPoint = distance(priorPoint, currentPoint);
          if (distanceToCurrentPoint > 10 * params.size) return;
        }

        if (mouse.is_drag == false) {
          if (data.length > 1) {
            data[data.length - 1].x = currentPoint.x;
            data[data.length - 1].y = currentPoint.y;
          } else {
            console.log(`adding point ${currentPoint.x},${currentPoint.y}`);
            data.push({ ...currentPoint, size: params.size || 1 });
          }
        } else {
          console.log(`adding point ${currentPoint.x},${currentPoint.y}`);
          data.push({ ...currentPoint, size: params.size || 1 });
        }

        // render the line
        this.renderData(data);
        this.Base_layers.render();
        break;
      }

      case 'moving_point': {
        // move the point
        if (this.hover?.pointIndex >= 0) {
          const index = this.hover.pointIndex;
          const point = data[index];
          point.x = currentPoint.x;
          point.y = currentPoint.y;
          this.renderData(data);
          this.Base_layers.render();
        } else if (this.hover?.midpointIndex >= 0) {
          const index = this.hover.midpointIndex;
          // insert current point after this index
          data.splice(index + 1, 0, currentPoint);
          this.hover = { pointIndex: index + 1 };
          // render the line
          this.renderData(data);
          this.Base_layers.render();
        }
        break;
      }

      default: {
        console.log(`unknown status ${this.status}`);
        break;
      }
    }
  }

  renderData(data) {
    app.State.do_action(
      new app.Actions.Bundle_action(
        'magic_crop_layer',
        'Update Magic Crop Layer',
        [
          new app.Actions.Update_layer_action(config.layer.id, {
            data: data,
          }),
        ],
      ),
    );
  }

  mouseup(e) {
    switch (this.status) {
      case 'moving_point': {
        this.hover = null;
        this.status = 'done';
        break;
      }
    }
  }

  render(ctx, layer) {
    this.render_aliased(ctx, layer);
  }

  /**
   * draw without antialiasing, sharp, ugly mode.
   *
   * @param {object} ctx
   * @param {object} layer
   */
  render_aliased(ctx, layer) {
    const { x, y, color, params } = layer;

    // scale down the size based on the zoom level
    const size = (params.size || 1) / config.ZOOM;

    const layerData = removeColinearPoints(layer.data);

    //set styles
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.translate(x, y);

    //draw
    ctx.beginPath();

    const firstPoint = layerData[0];
    ctx.moveTo(firstPoint.x, firstPoint.y);

    [...layerData, layerData[0]].forEach((currentPoint, i) => {
      const priorPoint = layerData[i - 1];
      if (currentPoint === null) {
        //break
        ctx.beginPath();
      } else {
        if (priorPoint == null) {
          //exception - point
          ctx.fillRect(
            currentPoint.x - Math.floor(size / 2) - 1,
            currentPoint.y - Math.floor(size / 2) - 1,
            size,
            size,
          );
        } else {
          //lines
          ctx.beginPath();
          this.draw_simple_line(
            ctx,
            priorPoint.x,
            priorPoint.y,
            currentPoint.x,
            currentPoint.y,
            size,
          );
        }
      }
    });

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
      // scale down the size based on the zoom level
      let size = configuration.minorSize / config.ZOOM;
      ctx.fillStyle = configuration.minorColor;
      ctx.strokeStyle = configuration.defaultStrokeColor;
      ctx.lineWidth = 1;

      const centerPoint = this.center(
        currentPoint,
        layerData[(i + 1) % layerData.length],
      );

      if (this.hover && this.hover.midpointIndex == i) {
        ctx.fillStyle = configuration.hoverMinorColor;
        size *= 1.5;
      }

      // draw a circle
      circle(ctx, centerPoint, size);
    });

    ctx.translate(-x, -y);
  }

  center(currentPoint, nextPoint) {
    return {
      x: (currentPoint.x + nextPoint.x) / 2,
      y: (currentPoint.y + nextPoint.y) / 2,
    };
  }

  draw_simple_line(ctx, from_x, from_y, to_x, to_y, size) {
    const dist_x = from_x - to_x;
    const dist_y = from_y - to_y;
    const distance = Math.sqrt(dist_x * dist_x + dist_y * dist_y);
    const radiance = Math.atan2(dist_y, dist_x);

    for (let j = 0; j < distance; j++) {
      var x_tmp =
        Math.round(to_x + Math.cos(radiance) * j) - Math.floor(size / 2) - 1;
      var y_tmp =
        Math.round(to_y + Math.sin(radiance) * j) - Math.floor(size / 2) - 1;

      ctx.fillRect(x_tmp, y_tmp, size, size);
    }
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
          const point = data[i];
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
  }

  on_leave() {
    return [new app.Actions.Reset_selection_action()];
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
