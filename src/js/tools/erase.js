import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Erase_class extends Base_tools_class {
    constructor(ctx) {
        super();
        this.Base_layers = new Base_layers_class();
        this.ctx = ctx;
        this.name = 'erase';
        this.tmpCanvas = null;
        this.tmpCanvasCtx = null;
        this.started = false;

        // define a fill eraser that converts the pixels under the mouse 10% closer to white
        this.fill_eraser = (ctx, args) => {

            const scale = {
                x: config.layer.width / config.layer.width_original,
                y: config.layer.height / config.layer.height_original,
            }

            const { mouse } = args;
            const { flow, circle } = args.params;

            const size = {
                w: Math.round(args.params.size / scale.x),
                h: Math.round(args.params.size / scale.y),
            }

            const start_position = {
                x: Math.round((mouse.x - config.layer.x) / scale.x - size.w / 2),
                y: Math.round((mouse.y - config.layer.y) / scale.y - size.h / 2)
            };

            const imageData = ctx.getImageData(start_position.x, start_position.y, size.w, size.h);
            const data = imageData.data;

            for (let x = 0; x < size.w; x++) {
                for (let y = 0; y < size.h; y++) {
                    let i = (x + y * size.w) * 4;
                    let effect = flow / 100;

                    let percent = 1;

                    if (circle) {
                        // reduce the effect based on radial distance from center of rectangle
                        const dx = x - size.w / 2;
                        const dy = y - size.h / 2;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        percent = distance / (size.w / 2);
                        if (percent > 1) continue;
                    } else {
                        // reduce the effect based on distance from edge of rectangle
                        const dx = Math.min(x, size.w - x);
                        const dy = Math.min(y, size.h - y);
                        const distance = Math.min(dx, dy);
                        percent = 1 - distance / (size.w / 2);
                    }

                    // reduce effect based on distance from center of circle
                    effect -= effect * percent;

                    // apply transparency
                    const transparentIndex = i + 3;
                    data[transparentIndex] -= data[transparentIndex] * effect;
                }
            }

            ctx.putImageData(imageData, start_position.x, start_position.y);
        };
    }

    load() {
        this.default_events();
    }

    default_dragMove(event, is_touch) {
        if (config.TOOL.name != this.name) return;
        this.mousemove(event, is_touch);

        //mouse cursor
        var mouse = this.get_mouse_info(event);
        var params = this.getParams();
        if (params.circle == true)
            this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'circle');
        else this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'rect');
    }

    on_params_update() {
    }

    mousedown(e) {
        this.started = false;
        var mouse = this.get_mouse_info(e);
        var params = this.getParams();
        if (mouse.click_valid == false) {
            return;
        }
        if (config.layer.type != 'image') {
            alertify.error(
                'This layer must contain an image. Please convert it to raster to apply this tool.',
            );
            return;
        }
        if (config.layer.is_vector == true) {
            alertify.error(
                'Layer is vector, convert it to raster to apply this tool.',
            );
            return;
        }
        if (config.layer.rotate || 0 > 0) {
            alertify.error(
                'Erase on rotate object is disabled. Please rasterize first.',
            );
            return;
        }
        this.started = true;

        //get canvas from layer
        this.tmpCanvas = document.createElement('canvas');
        this.tmpCanvasCtx = this.tmpCanvas.getContext('2d', { willReadFrequently: true });
        this.tmpCanvas.width = config.layer.width_original;
        this.tmpCanvas.height = config.layer.height_original;
        this.tmpCanvasCtx.drawImage(config.layer.link, 0, 0);

        const scale = {
            x: config.layer.width / config.layer.width_original,
            y: config.layer.height / config.layer.height_original,
        }

        this.tmpCanvasCtx.scale(scale.x, scale.y);

        //do erase
        this.fill_eraser(this.tmpCanvasCtx, { mouse, params });

        //register tmp canvas for faster redraw
        config.layer.link_canvas = this.tmpCanvas;
        config.need_render = true;
    }

    mousemove(e, is_touch) {
        var mouse = this.get_mouse_info(e);
        var params = this.getParams();
        if (mouse.is_drag == false) return;
        if (mouse.click_valid == false) {
            return;
        }
        if (this.started == false) {
            return;
        }
        if (mouse.click_x == mouse.x && mouse.click_y == mouse.y) {
            //same coordinates
            return;
        }

        //do erase
        this.fill_eraser(this.tmpCanvasCtx, { mouse, params });

        //draw draft preview
        config.need_render = true;
    }

    mouseup(e) {
        if (this.started == false) {
            return;
        }
        delete config.layer.link_canvas;

        app.State.do_action(
            new app.Actions.Bundle_action('erase_tool', 'Erase Tool', [
                new app.Actions.Update_layer_image_action(this.tmpCanvas),
            ]),
        );

        //decrease memory
        this.tmpCanvas.width = 1;
        this.tmpCanvas.height = 1;
        this.tmpCanvas = null;
        this.tmpCanvasCtx = null;
    }

    erase_general(ctx, type, mouse, size, strict, is_circle, is_touch) {
        var mouse_x = Math.round(mouse.x) - config.layer.x;
        var mouse_y = Math.round(mouse.y) - config.layer.y;
        var alpha = config.ALPHA;
        var mouse_last_x = parseInt(mouse.last_x) - config.layer.x;
        var mouse_last_y = parseInt(mouse.last_y) - config.layer.y;

        ctx.beginPath();
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (alpha < 255)
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha / 255 / 10 + ')';
        else ctx.strokeStyle = 'rgba(255, 255, 255, 1)';

        if (is_circle == false) {
            //rectangle
            var size_half = Math.ceil(size / 2);
            if (size == 1) {
                //single cell mode
                mouse_x = Math.floor(mouse.x) - config.layer.x;
                mouse_y = Math.floor(mouse.y) - config.layer.y;
                size_half = 0;
            }
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha / 255 + ')';
            ctx.fillRect(mouse_x - size_half, mouse_y - size_half, size, size);
            ctx.restore();
        } else {
            //circle
            ctx.save();

            if (strict == false) {
                var radgrad = ctx.createRadialGradient(
                    mouse_x,
                    mouse_y,
                    size / 8,
                    mouse_x,
                    mouse_y,
                    size / 2,
                );
                if (type == 'click')
                    radgrad.addColorStop(
                        0,
                        'rgba(255, 255, 255, ' + alpha / 255 + ')',
                    );
                else if (type == 'move')
                    radgrad.addColorStop(
                        0,
                        'rgba(255, 255, 255, ' + alpha / 255 / 2 + ')',
                    );
                radgrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            }

            //set Composite
            ctx.globalCompositeOperation = 'destination-out';
            if (strict == true)
                ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha / 255 + ')';
            else ctx.fillStyle = radgrad;
            ctx.beginPath();
            ctx.arc(mouse_x, mouse_y, size / 2, 0, Math.PI * 2, true);
            ctx.fill();
            ctx.restore();
        }

        //extra work if mouse moving fast - fill gaps
        if (
            type == 'move' &&
            is_circle == true &&
            mouse_last_x != false &&
            mouse_last_y != false &&
            is_touch !== true
        ) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';

            ctx.beginPath();
            ctx.moveTo(mouse_last_x, mouse_last_y);
            ctx.lineTo(mouse_x, mouse_y);
            ctx.stroke();

            ctx.restore();
        }
    }
}
export default Erase_class;
