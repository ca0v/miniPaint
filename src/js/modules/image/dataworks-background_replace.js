import { warn, reportError, log } from '../../dataworks-plus-extensions.js';
import app from './../../app.js';
import config from '../../config.js';
import Dialog_class from '../../libs/popup.js';
import Base_layers_class from '../../core/base-layers.js';

var instance = null;

const COLORS_TO_REMEMBER = 16; // max custom colors stored and rendered on color picker
const COLORS_TO_RENDER = 5; // max colors rendered on background replace dialog
const DEFAULT_COLOR = '#757575';
const ALTERNATIVE_COLORS = ['#72d6ef'];

function injectCustomColorsIntoColorPicker(colorPicker) {
    const colors = readSetting('CUSTOM_COLORS', [DEFAULT_COLOR, ...ALTERNATIVE_COLORS]);
    updateColorPicker(colorPicker, colors);

    colorPicker.addEventListener(
        'change',
        () => {
            const theColor = colorPicker.value;
            const colors = readSetting('CUSTOM_COLORS', []);
            if (!colors.includes(theColor)) {
                colors.push(theColor);
                while (colors.length > COLORS_TO_REMEMBER) {
                    colors.shift(); // remove oldest color
                }
            } else {
                const index = colors.indexOf(theColor);
                if (index < 0) throw `Color ${theColor} not found in ${colors}`;
                colors.splice(index, 1);
                colors.push(theColor); // this is now newest color
            }
            writeSetting('CUSTOM_COLORS', colors);
            updateColorPicker(colorPicker, colors);
        },
        false,
    );
}

function updateColorPicker(colorPicker, colors) {
    let datalist = colorPicker.querySelector('datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'customColors';
        colorPicker.appendChild(datalist);
        colorPicker.setAttribute('list', datalist.id);
    }
    datalist.innerHTML = '';
    colors.forEach((color) => {
        const option = document.createElement('option');
        option.value = color;
        datalist.appendChild(option);
    });
}

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

function getCustomColors() {
    const colors = [DEFAULT_COLOR, ...ALTERNATIVE_COLORS];
    const distinct = [...new Set(colors)];
    const customColors = readSetting('CUSTOM_COLORS', []);
    const colorsToAdd = [];
    while (distinct.length + colorsToAdd.length < COLORS_TO_RENDER && customColors.length) {
        const color = customColors.pop();
        if (!distinct.includes(color)) {
            colorsToAdd.push(color);
        }
    }
    distinct.push(...colorsToAdd.reverse());
    return distinct;
}

function getInitialColorForColorPicker() {
    const colors = readSetting('CUSTOM_COLORS', []);
    if (colors.length) {
        return colors[0];
    }
    const input = document.getElementById('color_hex');
    if (input) return input.value;

    return DEFAULT_COLOR;
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

                const $label = $('<label>').text('Select a background color: ');

                const $div = $('<div>');

                const template = `
                <style>
                    .flex {
                        display: flex;
                        gap: 0.25rem;
                        flex: 1;
                    }
                    .flex > button {
                        width: 6rem;
                        height: 3rem;
                    }
                    .flex > label {
                        width: 10rem;
                        height: 3rem;
                        no-wrap: true;
                    }
                    .flex input.color-picker {
                        display: none;
                    }
                    .flex > label.color-picker {
                        white-space: nowrap;                  
                        margin: 0;
                        display: flex;
                        border: 3px solid transparent;
                        padding: 0.5rem;
                    }
                    .flex > label.color-picker:hover {
                        border-color: black;
                    }
                </style>
                <div class="flex">
                    <label class="color-picker" title="Open a color picker to select a custom color.">Add a color <input class="color-picker" type="color" value="${getInitialColorForColorPicker()}"/></label>
                </div>
                <label>Auto Replace? <input class="auto-replace" type="checkbox" checked/></label>
                `;

                $div.append($.parseHTML(template));

                // find the element where the 'data-id' is 'params_content'
                const target = document.querySelector('[data-id="params_content"]');
                $(target).append($label).append($div);

                const colorPicker = target.querySelector('input.color-picker');
                if (colorPicker) {
                    injectCustomColorsIntoColorPicker(colorPicker);
                    createColorPickerButtons(target, { canvas_preview, w, h });
                    colorPicker.addEventListener('change', () => {
                        createColorPickerButtons(target, { canvas_preview, w, h });
                    });
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
                    GetNewReplacement(DEFAULT_COLOR, { canvas_preview, w, h });
                }
            },
            params: [],
            on_finish: function on_finish(params) {
                _this.save_changes(params);
            },
        };
        this.POP.show(settings);

        function createColorPickerButtons(target, options) {
            const flex = target.querySelector('.flex');
            // remove all the button elements
            flex.querySelectorAll('button').forEach((button) => button.remove());
            const colors = getCustomColors();
            colors.forEach((color) => {
                const button = $.parseHTML(
                    `<button class="btn btn-md BackgroundReplaceColorButton" type="button" style="background-color:${color}"></button>`,
                )[0];
                flex.insertBefore(button, flex.querySelector('label.color-picker'));
                button.addEventListener('click', (e) => {
                    replaceBackground(e.target, options);
                });
            });
        }
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

function replaceBackground(target, options) {
    $('.BackgroundReplaceColorButton').removeClass('selected');
    $(target).addClass('selected');
    const backgroundColor = $(target).css('background-color');
    // convert rgb to hex
    const hexColor = rgbToHex(backgroundColor);
    log('hexColor', hexColor);

    GetNewReplacement(hexColor, options);
}

function GetNewReplacement(colorInput, options) {
    const { canvas_preview, w, h } = options;
    const baseLayers = new Base_layers_class();
    const canvas = baseLayers.convert_layer_to_canvas(null, true);

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

    const NewImage = document.getElementById('backgroundReplaceImageHolder');
    if (!NewImage) {
        warn("'#backgroundReplaceImageHolder' is not defined.");
        return;
    }

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
