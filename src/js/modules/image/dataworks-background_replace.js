import { warn, reportError, log } from '../../dataworks-plus-extensions.js';
import app from './../../app.js';
import config from '../../config.js';
import Dialog_class from '../../libs/popup.js';
import Base_layers_class from '../../core/base-layers.js';

var instance = null;

function readSetting(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value == null) {
        return defaultValue;
    }
    return JSON.parse(value);
}

function writeSetting(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function rgbToHex(rgb) {
    const [r, g, b] = rgb.match(/\d+/g);
    const hexR = parseInt(r).toString(16);
    const hexG = parseInt(g).toString(16);
    const hexB = parseInt(b).toString(16);
    return `#${hexR}${hexG}${hexB}`;
}

function getBackgroundColorFromColorPicker() {
    const input = document.getElementById('color_hex');
    return input.value;
}

class Effects_backgroundReplace_class {
    constructor() {
        //singleton
        if (instance) {
            return instance;
        }
        instance = this;

        this.POP = new Dialog_class();
        this.Base_layers = new Base_layers_class();
    }

    backgroundReplace() {
        const _this = this;
        if (config.layer.type != 'image') {
            reportError('Please merge layers to apply this tool. Layers -> Merge Down.');
            //return;
        }

        const settings = {
            title: 'Background Replace',
            preview: true,
            on_change: (params, canvas_preview, w, h) => {
                let swal = window['Swal'];
                if (typeof swal == 'undefined') {
                    warn('Swal is not defined.');
                }
                const NewImage = document.getElementById('backgroundReplaceImageHolder');

                const $label = $('<label>').text('Select a background color: ');

                const $div = $('<div>');

                const template = `
                <style>
                    .flex {
                        display: flex;
                        gap: 0.25rem;
                        flex: 1;
                    }
                    .flex > * {
                        width: 8rem;
                        height: 2rem;
                    }
                    .flex > label {
                        no-wrap: true;
                    }
                    .flex .color-picker {
                        width: 3rem;
                        height: 3rem;
                        border: none;
                        display: none;
                    }
                    .flex > label {
                        white-space: nowrap;                  
                        margin: 0;
                        display: flex;
                    }
                </style>
                <div class="flex">
                    <button class="btn btn-md BackgroundReplaceColorButton selected" type="button" style="background-color:#757575"></button>
                    <button class="btn btn-md BackgroundReplaceColorButton selected" type="button" style="background-color:#72d6ef"></button>
                    <button class="btn btn-md BackgroundReplaceColorButton selected color-picker-target" type="button" style="background-color:${getBackgroundColorFromColorPicker()}"></button>
                    <label>Pick a color <input class="color-picker" type="color" value="${getBackgroundColorFromColorPicker()}"/></label>
                </div>
                <label>Auto Replace? <input class="auto-replace" type="checkbox" checked/></label>
                `;

                $div.append($.parseHTML(template));

                // find the element where the 'data-id' is 'params_content'
                const target = document.querySelector('[data-id="params_content"]');
                $(target).append($label).append($div);

                const _canvas = this.Base_layers.convert_layer_to_canvas(null, true);

                $('.BackgroundReplaceColorButton').on('click', (e) => {
                    const target = e.target;
                    $('.BackgroundReplaceColorButton').removeClass('selected');
                    $(target).addClass('selected');
                    const backgroundColor = $(target).css('background-color');
                    // convert rgb to hex
                    const hexColor = rgbToHex(backgroundColor);
                    log('hexColor', hexColor);
                    GetNewReplacement(_canvas, hexColor);
                });

                const colorPickerTarget = target.querySelector('.color-picker-target');
                if (colorPickerTarget) {
                    const colorPicker = target.querySelector('.color-picker');
                    if (colorPicker) {
                        colorPicker.addEventListener(
                            'input',
                            () => {
                                const theColor = colorPicker.value;
                                $(colorPickerTarget).css('background-color', theColor);
                            },
                            false,
                        );
                    }
                }

                const autoReplace = target.querySelector('.auto-replace');
                if (autoReplace) {
                    autoReplace.checked = readSetting('AUTO_REPLACE_BACKGROUND', true);
                    autoReplace.addEventListener(
                        'change',
                        () => {
                            const isChecked = autoReplace.checked;
                            writeSetting('AUTO_REPLACE_BACKGROUND', isChecked);
                        },
                        false,
                    );
                }

                if (readSetting('AUTO_REPLACE_BACKGROUND', true)) {
                    // Get Default Replacement with Gray Background
                    GetNewReplacement(_canvas, '#757575');
                }

                function GetNewReplacement(canvas, colorInput) {
                    if (typeof Swal == 'undefined') {
                        warn('Swal is not defined.');
                        return;
                    }
                    Swal.fire({
                        title: 'Processing...',
                        text: 'Please wait',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        },
                    });

                    var dataURL = canvas.toDataURL('image/jpeg');

                    if (dataURL != null) {
                        $.ajax({
                            type: 'POST',
                            url: '../DWPService.asmx/GetBackgroundReplaceImageV2',
                            data: {
                                imgBase64: dataURL,
                                backgroundcolor: colorInput,
                            },
                            dataType: 'text',
                            success: function (data, status) {
                                // Remove XML Tags from response
                                data = data.replace(/<.*>/gm, '');

                                NewImage.src = data;
                                NewImage.onload = function () {
                                    var canvas = document.createElement('canvas');
                                    var context = canvas.getContext('2d');
                                    canvas.width = NewImage.width;
                                    canvas.height = NewImage.height;

                                    context.drawImage(NewImage, 0, 0, w, h);
                                    var myData = context.getImageData(0, 0, NewImage.width, NewImage.height);

                                    canvas_preview.putImageData(myData, 0, 0);

                                    Swal.close();
                                };
                            },
                            error: function (e) {
                                Swal.close();

                                reportError('Error Retrieving Image.');
                                return;
                            },
                        });
                    } else {
                        // Error
                        Swal.close();

                        reportError('Error Sending Image.');
                        return;
                    }
                }
            },
            params: [],
            on_finish: function on_finish(params) {
                _this.save_changes(params);
            },
        };
        this.POP.show(settings);
    }

    save_changes(params) {
        //get canvas from layer
        this.Base_layers.convert_layer_to_canvas(null, true);

        //change data
        const NewImage = document.getElementById('backgroundReplaceImageHolder');
        if (!NewImage) {
            warn("'#backgroundReplaceImageHolder' is not defined.");
            return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = NewImage.width;
        canvas.height = NewImage.height;

        ctx.drawImage(NewImage, 0, 0);
        const data = ctx.getImageData(0, 0, NewImage.width, NewImage.height);

        ctx.putImageData(data, 0, 0);

        //save
        //this.Base_layers.update_layer_image(canvas);
        app.State.do_action(new app.Actions.Update_layer_image_action(canvas));
    }
}

export default Effects_backgroundReplace_class;
