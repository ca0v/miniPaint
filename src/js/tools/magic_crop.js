import app from "../app.js";
import config from "../config.js";
import Base_tools_class from "../core/base-tools.js";
import Base_layers_class from "../core/base-layers.js";
import GUI_tools_class from "../core/gui/gui-tools.js";
import Base_gui_class from "../core/base-gui.js";
import Base_selection_class from "../core/base-selection.js";
import alertify from "alertifyjs/build/alertify.min.js";

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
  doubleClick(event) {
    const data = config.layer.data;
    if (data.length == 0) return;

    //close path
    data.push({ ...data[0] });
    this.renderData(data);

    this.status = "done";

    //crop
    this.on_params_update();
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
      config.layer.data.push(currentPoint);
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
      const distanceToCurrentPint = distance(priorPoint, currentPoint);
      if (distanceToCurrentPint < 10 * params.size) return;
    }

    console.log(`adding point ${currentPoint.x},${currentPoint.y}`);
    if (mouse.is_drag == false) {
      if (data.length) {
        data[data.length - 1].x = currentPoint.x;
        data[data.length - 1].y = currentPoint.y;
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
    if (layer.data.length == 0) return;

    const params = layer.params;
    const data = layer.data;
    console.log({ data });
    const n = data.length;
    const size = params.size || 1;

    //set styles
    ctx.fillStyle = layer.color;
    ctx.strokeStyle = layer.color;
    ctx.translate(layer.x, layer.y);

    //draw
    ctx.beginPath();
    ctx.moveTo(data[0][0], data[0][1]);
    for (let i = 1; i < n; i++) {
      const priorPoint = data[i - 1];
      const currentPoint = data[i];
      if (currentPoint === null) {
        console.log(`beginPath at ${i}`);
        //break
        ctx.beginPath();
      } else {
        if (data[i - 1] == null) {
          console.log(`fillRect at ${i}`);
          //exception - point
          ctx.fillRect(
            currentPoint.x - Math.floor(size / 2) - 1,
            currentPoint.y - Math.floor(size / 2) - 1,
            size,
            size
          );
        } else {
          console.log(`draw_simple_line at ${i}`);
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
    }
    if (n == 1 || data[1] == null) {
      //point
      ctx.beginPath();
      ctx.fillRect(
        data[0][0] - Math.floor(size / 2) - 1,
        data[0][1] - Math.floor(size / 2) - 1,
        size,
        size
      );
    }

    ctx.translate(-layer.x, -layer.y);
  }

  draw_simple_line(ctx, from_x, from_y, to_x, to_y, size) {
    console.log(
      `draw_simple_line: ${from_x},${from_y} to ${to_x},${to_y} of size ${size}`
    );
    const dist_x = from_x - to_x;
    const dist_y = from_y - to_y;
    const distance = Math.sqrt(dist_x * dist_x + dist_y * dist_y);
    const radiance = Math.atan2(dist_y, dist_x);

    console.log(`draw_simple_line: distance=${distance},radiance=${radiance}`);

    for (let j = 0; j < distance; j++) {
      var x_tmp =
        Math.round(to_x + Math.cos(radiance) * j) - Math.floor(size / 2) - 1;
      var y_tmp =
        Math.round(to_y + Math.sin(radiance) * j) - Math.floor(size / 2) - 1;

      ctx.fillRect(x_tmp, y_tmp, size, size);

      console.log(`drawing line from ${from_x},${from_y} to ${to_x},${to_y}`);
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

      const x = link.x;
      const y = link.y;

      if (link.type == "image") {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        //cut required part
        ctx.translate(-cropLeft, -cropTop);
        ctx.drawImage(link.link, 0, 0);
        ctx.translate(0, 0);
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
