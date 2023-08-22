import app from "../app.js";
import config from "../config.js";
import Base_tools_class from "../core/base-tools.js";
import Base_layers_class from "../core/base-layers.js";
import GUI_tools_class from "../core/gui/gui-tools.js";
import Base_gui_class from "../core/base-gui.js";
import Base_selection_class from "../core/base-selection.js";
import alertify from "alertifyjs/build/alertify.min.js";

function removeColinearPoints(points) {
  const result = [];
  const n = points.length;
  if (!n) return result;

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
        `removing colinear point ${currentPoint.x},${currentPoint.y}`
      );
      result.push(currentPoint);
    }
  }

  const lastPoint = points.at(-1);
  result.push(lastPoint);

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
    this.status = "";
    this.Base_layers = new Base_layers_class();
    this.Base_gui = new Base_gui_class();
    this.GUI_tools = new GUI_tools_class();
    this.ctx = ctx;
    this.name = "magic_crop";
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
    document.addEventListener("dblclick", (event) => {
      this.doubleClick(event);
    });
  }

  default_dragStart(event) {
    this.is_mousedown_canvas = false;
    if (config.TOOL.name != this.name) return;
    if (!event.target.closest("#main_wrapper")) return;

    this.is_mousedown_canvas = true;
    this.mousedown(event);
  }

  // close the path and crop the image
  doubleClick(e) {
    const data = config.layer.data;
    if (data.length == 0) return;

    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return;

    //close path
    const currentPoint = {
      x: Math.ceil(mouse.x - config.layer.x),
      y: Math.ceil(mouse.y - config.layer.y),
    };

    data.push(currentPoint);
    data.push({ ...data[0] });

    this.renderData(data);

    this.status = "done";
  }

  /**
   * When the mouse is pressed, create a new layer and draw a dot
   */
  mousedown(e) {
    const mouse = this.get_mouse_info(e);
    if (mouse.click_valid == false) return;

    const params_hash = this.get_params_hash();
    const opacity = Math.round((config.ALPHA / 255) * 100);

    const currentPoint = {
      x: Math.ceil(mouse.x - config.layer.x),
      y: Math.ceil(mouse.y - config.layer.y),
    };

    if (config.layer.type != this.name || params_hash != this.params_hash) {
      //register new object - current layer is not ours or params changed
      this.layer = {
        type: this.name,
        data: [currentPoint],
        opacity: opacity,
        params: this.clone(this.getParams()),
        status: "draft",
        render_function: [this.name, "render"],
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
        new app.Actions.Bundle_action("magic_crop_layer", "Magic Crop Layer", [
          new app.Actions.Insert_layer_action(this.layer),
        ])
      );
      this.params_hash = params_hash;
    } else {
      if (this.status === "done") {
        config.layer.data = [currentPoint];
      } else {
        config.layer.data.push(currentPoint);
      }
    }
    this.status = "drawing";
  }

  /**
   * When the mouse moves, draw a straight line from the previous point to the current point.
   */
  mousemove(e) {
    if (this.status !== "drawing") return;
    // render a line from the previous point to the current point
    const mouse = this.get_mouse_info(e);
    const params = this.getParams();
    if (mouse.click_valid == false) {
      return;
    }

    //add point
    const currentPoint = {
      x: Math.ceil(mouse.x - config.layer.x),
      y: Math.ceil(mouse.y - config.layer.y),
    };

    const data = config.layer.data;
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
        data.push({ ...currentPoint, size: params.size || 1 });
      }
    } else {
      data.push({ ...currentPoint, size: params.size || 1 });
    }

    // render the line
    this.renderData(data);

    this.Base_layers.render();
  }

  renderData(data) {
    app.State.do_action(
      new app.Actions.Bundle_action(
        "magic_crop_layer",
        "Update Magic Crop Layer",
        [
          new app.Actions.Update_layer_action(config.layer.id, {
            data: data,
          }),
        ]
      )
    );
  }

  mouseup(e) {
    var mouse = this.get_mouse_info(e);

    if (!this.Base_selection.is_drag) {
      return;
    }
    if (e.type == "mousedown" && mouse.click_valid == false) {
      return;
    }

    var width = mouse.x - this.selection.x;
    var height = mouse.y - this.selection.y;

    if (width == 0 || height == 0) {
      //cancel selection
      this.Base_selection.reset_selection();
      config.need_render = true;
      return;
    }

    if (this.selection.width != null) {
      //make sure coords not negative
      var details = this.selection;
      var x = details.x;
      var y = details.y;
      if (details.width < 0) {
        x = x + details.width;
      }
      if (details.height < 0) {
        y = y + details.height;
      }
      this.selection = {
        x: x,
        y: y,
        width: Math.abs(details.width),
        height: Math.abs(details.height),
      };
    }

    //control boundaries
    if (this.selection.x < 0) {
      this.selection.width += this.selection.x;
      this.selection.x = 0;
    }
    if (this.selection.y < 0) {
      this.selection.height += this.selection.y;
      this.selection.y = 0;
    }
    if (this.selection.x + this.selection.width > config.WIDTH) {
      this.selection.width = config.WIDTH - this.selection.x;
    }
    if (this.selection.y + this.selection.height > config.HEIGHT) {
      this.selection.height = config.HEIGHT - this.selection.y;
    }

    app.State.do_action(
      new app.Actions.Set_selection_action(
        this.selection.x,
        this.selection.y,
        this.selection.width,
        this.selection.height,
        this.mousedown_selection
      )
    );
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
    const size = params.size || 1;

    const layerData = removeColinearPoints(layer.data);

    //set styles
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.translate(x, y);

    //draw
    ctx.beginPath();

    const firstPoint = layerData[0];
    ctx.moveTo(firstPoint.x, firstPoint.y);

    layerData.forEach((currentPoint, i) => {
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
            size
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
            size
          );
        }
      }
    });

    // now render the drag-points over the top of the lines
    layerData.forEach((currentPoint, i) => {
      const size = 10;
      ctx.fillStyle = "red";
      ctx.strokeStyle = "white";
      ctx.fillRect(
        currentPoint.x - Math.floor(size / 2) - 1,
        currentPoint.y - Math.floor(size / 2) - 1,
        size,
        size
      );
    });

    // also, draw semi-drag points at the centerpoint of each line
    layerData.forEach((currentPoint, i) => {
      const size = 5;
      ctx.fillStyle = "blue";
      ctx.strokeStyle = "white";
      if (i == 0) return;
      const priorPoint = layerData[i - 1];
      const centerPoint = {
        x: (currentPoint.x + priorPoint.x) / 2,
        y: (currentPoint.y + priorPoint.y) / 2,
      };

      ctx.fillRect(
        centerPoint.x - Math.floor(size / 2) - 1,
        centerPoint.y - Math.floor(size / 2) - 1,
        size,
        size
      );
    });

    ctx.translate(-x, -y);
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

      if (link.type == "image") {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        //cut required part
        ctx.translate(-cropLeft, -cropTop);
        ctx.drawImage(link.link, 0, 0);
        ctx.translate(0, 0);

        // create a image mask to hide the parts of the image that are not inside the polygon defined by the data
        const maskCanvas = document.createElement("canvas");
        const maskCtx = maskCanvas.getContext("2d");
        maskCanvas.width = config.WIDTH;
        maskCanvas.height = config.HEIGHT;
        maskCtx.fillStyle = "#000000";
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
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(maskCanvas, 0, 0);

        actions.push(
          new app.Actions.Update_layer_image_action(canvas, link.id)
        );

        actions.push(
          new app.Actions.Update_layer_action(link.id, {
            x: 0,
            y: 0,
            width: cropWidth,
            height: cropHeight,
            width_original: cropWidth,
            height_original: cropHeight,
          })
        );
      }
    });

    actions.push(
      new app.Actions.Prepare_canvas_action("undo"),
      new app.Actions.Update_config_action({
        WIDTH: cropWidth,
        HEIGHT: cropHeight,
      }),
      new app.Actions.Prepare_canvas_action("do")
    );

    // delete the magic crop layer
    actions.push(
      new app.Actions.Delete_layer_action(config.layer.id),
      new app.Actions.Reset_selection_action()
    );

    await app.State.do_action(
      new app.Actions.Bundle_action(
        "magic_crop_tool",
        "Magic Crop Tool",
        actions
      )
    );
  }

  on_leave() {
    return [new app.Actions.Reset_selection_action()];
  }
}

export default MagicCrop_class;