import app from './../../app.js';
import config from './../../config.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';

class Right_Triangle_class extends Base_tools_class {
  constructor(ctx) {
    super();
    this.Base_layers = new Base_layers_class();
    this.ctx = ctx;
    this.name = 'right_triangle';
    this.layer = {};
    this.best_ratio = 1;
    this.snap_line_info = { x: null, y: null };
    this.coords = [
      [0, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ];
  }

  load() {
    this.default_events();
  }

  mousedown(e) {
    this.shape_mousedown(e);
  }

  mousemove(e) {
    this.shape_mousemove(e);
  }

  mouseup(e) {
    this.shape_mouseup(e);
  }

  render_overlay(ctx) {
    var ctx = this.Base_layers.ctx;
    this.render_overlay_parent(ctx);
  }

  demo(ctx, x, y, width, height) {
    this.draw_shape(ctx, x, y, width, height, this.coords);
  }

  render(ctx, layer) {
    var params = layer.params;
    var fill = params.fill;

    ctx.save();

    //set styles
    ctx.strokeStyle = 'transparent';
    ctx.fillStyle = 'transparent';
    if (params.border) ctx.strokeStyle = params.border_color;
    if (params.fill) ctx.fillStyle = params.fill_color;
    ctx.lineWidth = params.border_size;

    //draw with rotation support
    ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    ctx.rotate((layer.rotate * Math.PI) / 180);
    this.draw_shape(ctx, -layer.width / 2, -layer.height / 2, layer.width, layer.height, this.coords, false);

    ctx.restore();
  }
}

export default Right_Triangle_class;
