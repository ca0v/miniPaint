import { log, healSelectionGeometry } from '../dataworks-plus-extensions.js';

import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Base_gui_class from './../core/base-gui.js';
import Base_selection_class from './../core/base-selection.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const USE_DATAWORKS = true;
const mouseDownState = {
    mouse: { x: 0, y: 0 },
    selection: { x: 0, y: 0, width: 0, height: 0 },
    mode: '',
};

class Crop_class extends Base_tools_class {
    constructor(ctx) {
        super();
        var _this = this;
        this.Base_layers = new Base_layers_class();
        this.Base_gui = new Base_gui_class();
        this.GUI_tools = new GUI_tools_class();
        this.ctx = ctx;
        this.name = 'crop';
        this.selection = {
            x: null,
            y: null,
            width: null,
            height: null,
        };
        var sel_config = {
            enable_background: true,
            enable_borders: false,
            enable_controls: true,
            crop_lines: false,
            enable_rotation: false,
            enable_move: true /* shows the move cursor */,
            data_function: function () {
                return _this.selection;
            },
        };
        this.mousedown_selection = null;
        this.Base_selection = new Base_selection_class(
            ctx,
            sel_config,
            this.name,
        );
    }

    load() {
        this.default_events();
    }

    default_dragStart(event) {
        this.is_mousedown_canvas = false;
        if (config.TOOL.name != this.name) return;
        if (!event.target.closest('#main_wrapper')) return;

        this.is_mousedown_canvas = true;
        this.mousedown(event);
    }

    mousedown(e) {
        var mouse = this.get_mouse_info(e);
        mouseDownState.mouse = { x: mouse.x, y: mouse.y };
        mouseDownState.selection = {
            x: this.selection.x,
            y: this.selection.y,
            width: this.selection.width,
            height: this.selection.height,
        };
        mouseDownState.mode = '';

        if (this.Base_selection.is_drag == false || mouse.click_valid == false)
            return;

        this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));

        if (this.Base_selection.mouse_lock !== null) {
            return;
        }

        if (USE_DATAWORKS) {
            // if mouse is inside selection, enter 'move' mode
            const left = this.selection.x;
            const top = this.selection.y;
            const right = this.selection.x + this.selection.width;
            const bottom = this.selection.y + this.selection.height;
            if (
                mouse.x > left &&
                mouse.x < right &&
                mouse.y > top &&
                mouse.y < bottom
            ) {
                //move
                log(
                    `dataworks entering 'move' mode because mouse is inside selection`,
                );
                mouseDownState.mode = 'move'; // dataworks: from bundle_9771.js line 33544
                return;
            }

            const selection = healSelectionGeometry({
                x: mouse.x,
                y: mouse.y,
                width: 0,
                height: 0,
            });

            this.Base_selection.set_selection(
                selection.x,
                selection.y,
                selection.width,
                selection.height,
            );
            return;
        }
        this.Base_selection.set_selection(mouse.x, mouse.y, 0, 0);
    }

    mousemove(e) {
        var mouse = this.get_mouse_info(e);
        if (this.Base_selection.is_drag == false || mouse.is_drag == false) {
            return;
        }
        if (e.type == 'mousedown' && mouse.click_valid == false) {
            return;
        }
        if (this.Base_selection.mouse_lock !== null) {
            return;
        }

        if (USE_DATAWORKS) {
            if (mouseDownState.mode == 'move') {
                //move selection
                const dx = mouse.x - mouseDownState.mouse.x;
                const dy = mouse.y - mouseDownState.mouse.y;
                config.need_render = true;
                log(`dataworks is moving the selection by ${dx}, ${dy}`);
                this.selection.x = mouseDownState.selection.x + dx;
                this.selection.y = mouseDownState.selection.y + dy;
                const selection = healSelectionGeometry(this.selection);
                this.Base_selection.set_selection(
                    selection.x,
                    selection.y,
                    selection.width,
                    selection.height,
                );
                return;
            }
        }

        const width = mouse.x - mouse.click_x;
        const height = mouse.y - mouse.click_y;

        if (e.ctrlKey == true || e.metaKey) {
            //ctrl is pressed - crop will be calculated based on global width and height ratio
            var ratio = config.WIDTH / config.HEIGHT;
            var width_new = Math.round(height * ratio);
            var height_new = Math.round(width / ratio);

            if (
                Math.abs((width * 100) / width_new) >
                Math.abs((height * 100) / height_new)
            ) {
                if ((width * 100) / width_new > 0) height = height_new;
                else height = -height_new;
            } else {
                if ((height * 100) / height_new > 0) width = width_new;
                else width = -width_new;
            }
        } else if (!e.shiftKey) {
            if (USE_DATAWORKS) {
                const { x, y } = this.selection;
                const selection = healSelectionGeometry({
                    x,
                    y,
                    width,
                    height,
                });
                this.Base_selection.set_selection(
                    selection.x,
                    selection.y,
                    selection.width,
                    selection.height,
                );
                return;
            }
        }

        this.Base_selection.set_selection(null, null, width, height);
    }

    mouseup(e) {
        var mouse = this.get_mouse_info(e);

        if (!this.Base_selection.is_drag) {
            return;
        }
        if (e.type == 'mousedown' && mouse.click_valid == false) {
            return;
        }

        const selection = healSelectionGeometry(this.selection);

        this.Base_selection.set_selection(
            selection.x,
            selection.y,
            selection.width,
            selection.height,
        );
    }

    render(ctx, layer) {
        // dataworks customization
        if (layer.width == 0 && layer.height == 0) return;
        var params = layer.params;

        var text = params.text;
        if (params.text == undefined) {
            params.text = 'Text example';
            text = 'Text example';
        }
        var size = params.size;
        var font = params.family.value;
        var stroke = params.stroke;
        var bold = params.bold;
        var italic = params.italic;
        var stroke_size = params.stroke_size;
        var align = params.align.value.toLowerCase();

        if (bold && italic) ctx.font = 'Bold Italic ' + size + 'px ' + font;
        else if (bold) ctx.font = 'Bold ' + size + 'px ' + font;
        else if (italic) ctx.font = 'Italic ' + size + 'px ' + font;
        else ctx.font = 'Normal ' + size + 'px ' + font;

        //main text
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.fillStyle = layer.color;
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = stroke_size;

        var start_x = layer.x;
        if (align == 'right') {
            start_x = layer.x + layer.width;
        } else if (align == 'center') {
            start_x = layer.x + Math.round(layer.width / 2);
        }

        if (stroke == false) ctx.fillText(text, start_x, layer.y);
        else ctx.strokeText(text, start_x, layer.y);
    }

    /**
     * do actual crop
     */
    async on_params_update() {
        var params = this.getParams();
        var selection = this.selection;
        // dataworks disabled this line: params.crop = true;
        this.GUI_tools.show_action_attributes();

        if (
            selection.width == null ||
            selection.width == 0 ||
            selection.height == 0
        ) {
            alertify.error('Empty selection');
            return;
        }

        // calix: I did not inject the logic from bundle_9771.js line 33781 because this code is completely different and the dataworks code is very verbose and repetitive, perhaps it can be refactored...not clear what the intent was
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
                'Crop on rotated layer is not supported. Convert it to raster to continue.' +
                    '(' +
                    rotated_name +
                    ')',
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

            if (link.type == 'image') {
                //also remove unvisible data
                let left = 0;
                if (x < 0) left = -x;
                let top = 0;
                if (y < 0) top = -y;
                let right = 0;
                if (x + width > selection.width)
                    right = x + width - selection.width;
                let bottom = 0;
                if (y + height > selection.height)
                    bottom = y + height - selection.height;
                let crop_width = width - left - right;
                let crop_height = height - top - bottom;

                //if image was streched
                let width_ratio = width / width_original;
                let height_ratio = height / height_original;

                //create smaller canvas
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                canvas.width = crop_width / width_ratio;
                canvas.height = crop_height / height_ratio;

                //cut required part
                ctx.translate(-left / width_ratio, -top / height_ratio);
                canvas.getContext('2d').drawImage(link.link, 0, 0);
                ctx.translate(0, 0);
                actions.push(
                    new app.Actions.Update_layer_image_action(canvas, link.id),
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
                }),
            );
        }

        actions.push(
            new app.Actions.Prepare_canvas_action('undo'),
            new app.Actions.Update_config_action({
                WIDTH: parseInt(selection.width),
                HEIGHT: parseInt(selection.height),
            }),
            new app.Actions.Prepare_canvas_action('do'),
            new app.Actions.Reset_selection_action(this.selection),
        );
        await app.State.do_action(
            new app.Actions.Bundle_action('crop_tool', 'Crop Tool', actions),
        );
    }

    on_leave() {
        return [new app.Actions.Reset_selection_action()];
    }
}

export default Crop_class;
