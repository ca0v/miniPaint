import Effects_common_class from '../abstract/css.js';
import Base_layers_class from './../../../core/base-layers.js';
import config from '../../../config';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';

class Effects_sepia_class extends Effects_common_class {
  constructor() {
    super();
    this.Base_layers = new Base_layers_class();
  }

  sepia(filter_id) {
    if (config.layer.type == null) {
      alertify.error('Layer is empty.');
      return;
    }

    var filter = this.Base_layers.find_filter_by_id(filter_id, 'sepia');

    var params = [{ name: 'value', title: 'Percentage:', value: (filter.value ??= 60), range: [0, 100] }];
    this.show_dialog('sepia', params, filter_id);
  }

  convert_value(value) {
    var system_value = value / 100;

    return system_value;
  }

  demo(canvas_id, canvas_thumb) {
    var canvas = document.getElementById(canvas_id);
    var ctx = canvas.getContext('2d');

    //draw
    var size = this.convert_value(60, null, 'preview');
    ctx.filter = 'sepia(' + size + ')';
    ctx.drawImage(canvas_thumb, 0, 0);
    ctx.filter = 'none';
  }

  render_pre(ctx, data) {
    var value = this.convert_value(data.params.value, data.params, 'save');
    var filter = 'sepia(' + value + ')';

    if (ctx.filter == 'none') ctx.filter = filter;
    else ctx.filter += ' ' + filter;
  }

  render_post(ctx, data) {
    ctx.filter = 'none';
  }
}

export default Effects_sepia_class;
