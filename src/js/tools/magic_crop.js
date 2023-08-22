import app from "../app.js";
import config from "../config.js";
import Base_tools_class from "../core/base-tools.js";
import Base_layers_class from "../core/base-layers.js";
import GUI_tools_class from "../core/gui/gui-tools.js";
import Base_gui_class from "../core/base-gui.js";
import Base_selection_class from "../core/base-selection.js";
import alertify from "alertifyjs/build/alertify.min.js";

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
  }

  /**
   * When the mouse is pressed, create a new layer and draw a dot
   */
  mousedown(e) {
    if (this.status === "done") this.status = "start";
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
  }

  /**
   * When the mouse moves, draw a straight line from the previous point to the current point.
   */
  mousemove(e) {
    if (this.status === "done") return;
    if (this.status === "start") this.status = "drawing";
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
    var params = this.getParams();
    var selection = this.selection;
    params.magic_crop = true;
    this.GUI_tools.show_action_attributes();

    if (
      selection.width == null ||
      selection.width == 0 ||
      selection.height == 0
    ) {
      alertify.error("Empty selection");
      return;
    }

    //check for rotation
    var rotated_name = false;
    for (var i in config.layers) {
      var link = config.layers[i];
      if (link.type == null) continue;

      if (link.rotate > 0) {
        rotated_name = link.name;
        break;
      }
    }
    if (rotated_name !== false) {
      alertify.error(
        "Crop on rotated layer is not supported. Convert it to raster to continue." +
          "(" +
          rotated_name +
          ")"
      );
      return;
    }

    //controll boundaries
    selection.x = Math.max(selection.x, 0);
    selection.y = Math.max(selection.y, 0);
    selection.width = Math.min(selection.width, config.WIDTH);
    selection.height = Math.min(selection.height, config.HEIGHT);

    let actions = [];

    for (var i in config.layers) {
      var link = config.layers[i];
      if (link.type == null) continue;

      let x = link.x;
      let y = link.y;
      let width = link.width;
      let height = link.height;
      let width_original = link.width_original;
      let height_original = link.height_original;

      //move
      x -= parseInt(selection.x);
      y -= parseInt(selection.y);

      if (link.type == "image") {
        //also remove unvisible data
        let left = 0;
        if (x < 0) left = -x;
        let top = 0;
        if (y < 0) top = -y;
        let right = 0;
        if (x + width > selection.width) right = x + width - selection.width;
        let bottom = 0;
        if (y + height > selection.height)
          bottom = y + height - selection.height;
        let crop_width = width - left - right;
        let crop_height = height - top - bottom;

        //if image was streched
        let width_ratio = width / width_original;
        let height_ratio = height / height_original;

        //create smaller canvas
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        canvas.width = crop_width / width_ratio;
        canvas.height = crop_height / height_ratio;

        //cut required part
        ctx.translate(-left / width_ratio, -top / height_ratio);
        canvas.getContext("2d").drawImage(link.link, 0, 0);
        ctx.translate(0, 0);
        actions.push(
          new app.Actions.Update_layer_image_action(canvas, link.id)
        );

        //update attributes
        width = Math.ceil(canvas.width * width_ratio);
        height = Math.ceil(canvas.height * height_ratio);
        x += left;
        y += top;
        width_original = canvas.width;
        height_original = canvas.height;
      }

      actions.push(
        new app.Actions.Update_layer_action(link.id, {
          x,
          y,
          width,
          height,
          width_original,
          height_original,
        })
      );
    }

    actions.push(
      new app.Actions.Prepare_canvas_action("undo"),
      new app.Actions.Update_config_action({
        WIDTH: parseInt(selection.width),
        HEIGHT: parseInt(selection.height),
      }),
      new app.Actions.Prepare_canvas_action("do"),
      new app.Actions.Reset_selection_action(this.selection)
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
