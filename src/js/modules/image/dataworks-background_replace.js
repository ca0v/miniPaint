import { warn, reportError } from '../../dataworks-plus-extensions.js';
import app from './../../app.js';
import config from '../../config.js';
import Dialog_class from '../../libs/popup.js';
import Base_layers_class from '../../core/base-layers.js';

var instance = null;

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
                swal?.fire({
                    title: 'Processing...',
                    text: 'Please wait',
                    allowOutsideClick: false,
                    didOpen: () => {
                        swal.showLoading();
                    },
                });

                const NewImage = document.getElementById('backgroundReplaceImageHolder');

                const $label = $('<label>').text('Select a background color: ');

                const $div = $('<div>');

                const template = `
                <style>
                    .flex {
                        display: flex;
                        gap: 0.25rem;
                    }
                    .flex > * {
                        width: 8rem;
                        height: 2rem;
                    }
                    .flex > label {
                        no-wrap: true;
                    }
                </style>
                <div class="flex">
                    <button class="btn btn-md BackgroundReplaceColorButton selected" type="button" style="background-color:#757575"></button>
                    <button class="btn btn-md BackgroundReplaceColorButton selected" type="button" style="background-color:#72d6ef"></button>
                    <button class="btn btn-md BackgroundReplaceColorButton selected" type="button" style="background-color:${getBackgroundColorFromColorPicker()}"></button>
                    <label>Picker<input type="color" id="color_hex" value="${getBackgroundColorFromColorPicker()}" style="width: 2rem; height: 2rem; padding: 0; margin: 0;"/></label>
                </div>
                `;

                const $buttons = $.parseHTML(template);

                $div.append($buttons);
                // find the element where the 'data-id' is 'params_content'
                const target = document.querySelector('[data-id="params_content"]');
                $(target).append($label).append($div);

                $('.BackgroundReplaceColorButton').click(function () {
                    $('.BackgroundReplaceColorButton').removeClass('selected');
                    $(this).addClass('selected');
                });

                const theInput = document.getElementById('color_hex');
                theInput?.addEventListener(
                    'input',
                    function () {
                        var theColor = theInput.value;
                        $('#BackgroundReplaceColor3').css('background-color', theColor);
                    },
                    false,
                );

                const _canvas = this.Base_layers.convert_layer_to_canvas(null, true);
                // Get Replacement with Gray Background
                $button1.click(function () {
                    GetNewReplacement(_canvas, '#757575');
                });
                // Get Replacement with Blue Background
                $button2.click(function () {
                    GetNewReplacement(_canvas, '#72d6ef');
                });
                // Get Replacement with Chosen Background
                $button3.click(function () {
                    GetNewReplacement(_canvas, getBackgroundColorFromColorPicker());
                });

                // Get Default Replacement with Gray Background
                GetNewReplacement(_canvas, '#757575');

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
