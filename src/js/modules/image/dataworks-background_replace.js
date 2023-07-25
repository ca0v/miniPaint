import { reportError } from '../../dataworks-plus-extensions.js';
import config from '../../config.js';
import Dialog_class from '../../libs/popup.js';
import Base_layers_class from '../../core/base-layers.js';
import Helper_class from '../../libs/helpers.js';
import ImageFilters_class from './../../libs/imagefilters.js';

var instance = null;

class Effects_backgroundReplace_class {
    constructor() {
        //singleton
        if (instance) {
            return instance;
        }
        instance = this;

        this.POP = new Dialog_class();
        this.Base_layers = new Base_layers_class();
        this.Helper = new Helper_class();
        this.ImageFilters = ImageFilters_class;
    }

    backgroundReplace() {
        const _this = this;
        if (config.layer.type != 'image') {
            reportError(
                'Please merge layers to apply this tool. Layers -> Merge Down.',
            );
            return;
        }

        const settings = {
            title: 'Background Replace',
            preview: true,
            on_change: function on_change(params, canvas_preview, w, h) {
                Swal.fire({
                    title: 'Processing...',
                    text: 'Please wait',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    },
                });

                const NewImage = document.getElementById(
                    'backgroundReplaceImageHolder',
                );

                const $label = $('<label>').text('Select a background color: ');

                const $div = $('<div>');

                const $button1 = $('<button>', {
                    id: 'BackgroundReplaceColor1',
                    class: 'btn btn-md BackgroundReplaceColorButton selected',
                    type: 'button',
                    style: 'background-color: #757575; width: 33%',
                }).html('&nbsp;');

                const $button2 = $('<button>', {
                    id: 'BackgroundReplaceColor2',
                    class: 'btn btn-md BackgroundReplaceColorButton',
                    type: 'button',
                    style: 'background-color: #72d6ef; width: 33%',
                }).html('&nbsp;');

                const $button3 = $('<button>', {
                    id: 'BackgroundReplaceColor3',
                    class: 'btn btn-md BackgroundReplaceColorButton',
                    type: 'button',
                    style:
                        'background-color: ' +
                        $('#main_color').val() +
                        '; width:33%',
                }).html('&nbsp;');

                $div.append($button1).append($button2).append($button3);
                $('#params_content').append($label).append($div);

                $('.BackgroundReplaceColorButton').click(function () {
                    $('.BackgroundReplaceColorButton').removeClass('selected');
                    $(this).addClass('selected');
                });

                const theInput = document.getElementById('main_color');
                theInput.addEventListener(
                    'input',
                    function () {
                        var theColor = theInput.value;
                        $('#BackgroundReplaceColor3').css(
                            'background-color',
                            theColor,
                        );
                    },
                    false,
                );

                const _canvas = this.Base_layers.convert_layer_to_canvas(
                    null,
                    true,
                );
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
                    GetNewReplacement(_canvas, $('#main_color').val());
                });

                // Get Default Replacement with Gray Background
                GetNewReplacement(_canvas, '#757575');

                function GetNewReplacement(canvas, colorInput) {
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
                                    var canvas =
                                        document.createElement('canvas');
                                    var context = canvas.getContext('2d');
                                    canvas.width = NewImage.width;
                                    canvas.height = NewImage.height;

                                    context.drawImage(NewImage, 0, 0, w, h);
                                    var myData = context.getImageData(
                                        0,
                                        0,
                                        NewImage.width,
                                        NewImage.height,
                                    );

                                    canvas_preview.putImageData(myData, 0, 0);

                                    swal.close();
                                };
                            },
                            error: function (e) {
                                swal.close();

                                reportError('Error Retrieving Image.');
                                return;
                            },
                        });
                    } else {
                        // Error
                        swal.close();

                        reportError('Error Sending Image.');
                        return;
                    }
                }
            },
            params: [],
            on_finish: function on_finish(params) {
                window.State.save();
                _this.save(params);
            },
        };
        this.POP.show(settings);
    }

    save() {
        //get canvas from layer
        this.Base_layers.convert_layer_to_canvas(null, true);

        //change data
        const NewImage = document.getElementById(
            'backgroundReplaceImageHolder',
        );

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = NewImage.width;
        canvas.height = NewImage.height;

        context.drawImage(NewImage, 0, 0);
        var data = context.getImageData(0, 0, NewImage.width, NewImage.height);

        ctx.putImageData(data, 0, 0);

        //save
        this.Base_layers.update_layer_image(canvas);
    }
}

export default Effects_backgroundReplace_class;
