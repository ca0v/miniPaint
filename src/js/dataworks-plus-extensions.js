import config from './config.js';

import alertify from '../../node_modules/alertifyjs/build/alertify.min.js';

export const enableDrawCenters = false;

export function setAspect() {
    config.ASPECT = (config.HEIGHT / config.WIDTH).toFixed(2) == config.RATIO;
}

export function reportError(message) {
    alertify.confirm(message);
}

export function updateDialogSize(dialog) {
    const imageLoadedElement = document.getElementById('ImageLoaded');
    if (!imageLoadedElement) {
        console.warn(`ImageLoaded element not found`);
        return;
    }
    dialog.width_mini = imageLoadedElement.naturalWidth;
    dialog.height_mini = imageLoadedElement.naturalHeight;
}

export function updateConfigurationSize(config) {
    const sizer = document.getElementById('ImageLoaded');
    if (!sizer) {
        console.warn(`'ImageLoaded' element not found`);
        return;
    }
    config.WIDTH = sizer.naturalWidth;
    config.HEIGHT = sizer.naturalHeight;
}

export function updateConfigurationVisibleSize(config) {
    const sizer = document.getElementById('canvas_minipaint');
    if (!sizer) {
        console.warn(`'canvas_minipaint' element not found`);
        return;
    }
    config.visible_width = sizer.width;
    config.HEIGHT = sizer.height;
}

export function updatePreviewSize(preview) {
    var sizer = document.getElementById('canvas_preview_wrapper_target');
    if (!sizer) {
        console.warn(`'canvas_preview_wrapper_target' element not found`);
        return;
    }
    preview.PREVIEW_SIZE.w = sizer.offsetWidth;
    preview.PREVIEW_SIZE.h = sizer.offsetHeight;
}

export async function injectPopupSaveCopyHandler(app) {
    await sleep(2000);
    const target = document.getElementById('popup_saveCopy');
    if (!target) {
        console.warn(`popup_saveCopy element not found`);
        return;
    }
    target.onclick = function () {
        if (config.REQUIRE_CROP?.value == '1') {
            if (config.ASPECT == true) {
                var img = _this.prepareCavasForServerSave();

                $('#PMEditedPhoto').val(img);
                goSaveAndBack();
            } else {
                reportError('Image requires cropping before being saved.');
            }
        } else {
            var img = _this.prepareCavasForServerSave();

            $('#PMEditedPhoto').val(img);
            goSaveAndBack();
        }
    };
}

export function isLandscape() {
    const canvasPreview = document.getElementById('canvas_preview');
    if (!canvasPreview) {
        console.warn(`canvas_preview element not found`);
        return;
    }
    return canvasPreview.width > canvasPreview.height;
}

export function tweakMenuDefinition(menuDefinition) {
    const fileMenuGroup = findMenuDefinition(menuDefinition, 'File');
    removeMenuItem(fileMenuGroup.children, 'New');

    const fileOpenMenuItem = findMenuDefinition(fileMenuGroup.children, 'Open');
    removeMenuItem(fileOpenMenuItem.children, 'Open URL');
    removeMenuItem(fileOpenMenuItem.children, 'Open Data URL');
    removeMenuItem(fileMenuGroup.children, 'Quick Save');
    removeMenuItem(fileMenuGroup.children, 'Quick Load');

    const saveAndReturnMenuItem = appendMenuDefinition(
        fileMenuGroup.children,
        lastItem(fileMenuGroup.children),
        {
            name: 'Save and Return',
            target: 'file/print.print', // TODO: popup_saveCopy
        }
    );

    appendMenuDefinition(fileMenuGroup.children, saveAndReturnMenuItem, {
        name: 'Cancel Image Editing',
        target: 'file/print.print', // TODO: goBack()
    });

    const editMenuGroup = findMenuDefinition(menuDefinition, 'Edit');
    appendMenuDefinition(
        editMenuGroup.children,
        findMenuDefinition(editMenuGroup.children, 'Redo'),
        {
            name: 'Restore Original Image',
            target: 'edit/restore.restore',
        }
    );

    removeMenuItem(editMenuGroup.children, 'Select All');

    const imageMenuGroup = findMenuDefinition(menuDefinition, 'Image');
    removeMenuItem(imageMenuGroup.children, 'Color Palette');

    const layerMenuGroup = findMenuDefinition(menuDefinition, 'Layer');
    removeMenuItem(layerMenuGroup.children, 'Composition');

    const effects = findMenuDefinition(menuDefinition, 'Effects');

    'Black and White,Box Blur,Denoise,Dither,Dot Screen,Edge,Emboss,Enrich,Grains,Heatmap,Mosaic,Oil,Sharpen,Solarize,Tilt Shift,Vignette,Vibrance,Vintage,Zoom Blur'
        .split(',')
        .forEach((menuTitle) => {
            removeMenuItem(effects.children, menuTitle);
        });

    // 'Gaussian Blur,Brightness,Contrast,Grayscale,Hue Rotate,Negative,Saturate,Sepia,Shadow'
    removeMenuItem(effects.children, 'Common Filters');
    removeMenuItem(effects.children, 'Instagram Filters');

    removeMenuItem(menuDefinition, 'Tools');
    const tools = appendMenuDefinition(menuDefinition, effects, {
        name: 'Tools',
        children: [],
    });

    // the "shapes" handler calls app.GUI_tools.activate_tool
    'Line,Rectangle,Circle,Text,Clone,Blur,Sharpen,Desaturate'
        .split(',')
        .reverse()
        .forEach((menuTitle) => {
            appendMenuDefinition(tools.children, null, {
                name: menuTitle,
                target: `shapes.${menuTitle.toLocaleLowerCase()}`,
            });
        });
}

function removeMenuItem(menuItems, name) {
    const index = menuItems.findIndex((item) => item.name === name);
    if (index < 0) throw `Menu item '${name}' not found`;
    menuItems.splice(index, 1);
}

function findMenuDefinition(menuDefinition, name) {
    const result = menuDefinition.find((item) => item.name === name);
    if (!result) {
        throw `Menu item ${name} not found`;
    }
    return result;
}

function appendMenuDefinition(children, priorChildItem, childItem) {
    if (priorChildItem) {
        const index = children.indexOf(priorChildItem);
        if (index < 0) throw `Child item ${priorChildItem} not found`;
        children.splice(index + 1, 0, childItem);
    } else {
        children.splice(0, 0, childItem);
    }
    return childItem;
}

export function tweakMousePosition(settings, state) {
    const selectActive = $('#select').hasClass('active');
    if (!selectActive) return;

    const {
        is_drag_type_left,
        is_drag_type_right,
        is_drag_type_top,
        is_drag_type_bottom,
    } = state;

    const { dx } = state;
    const dy = dx * config.RATIO;

    const allowUpdateWidth =
        (is_drag_type_left &&
            settings.data.width - dx >= $('#minWidth').val()) ||
        (is_drag_type_right &&
            settings.data.width + dx >= $('#minWidth').val());

    if (allowUpdateWidth) {
        // dx would be negative when moving left
        settings.data.x += dx;
        settings.data.y += dy;
        settings.data.width -= dx;
        settings.data.height -= dy;
    }
}

export function callIfImageTooSmall(layer, cb) {
    if (!config.REQUIRE_CROP?.value == '1') return;
    setTimeout(function () {
        if (
            layer.width_original < _config2.default.MIN_WIDTH ||
            layer.height_original < _config2.default.MIN_HEIGHT
        ) {
            $('#errorModalDimensions').modal('show');
            cb();
        }
    }, 1000);
}

export function tweakLayout(app) {
    const tools_container = document.getElementById('tools_container');
    const toolbarItems = Array.from(
        tools_container.querySelectorAll('span.item')
    );
    toolbarItems.forEach((item) => {
        const title = item.getAttribute('title');
        if (title) {
            item.textContent = title;
        }
    });

    aliasTool(app, 'rotate', 'image/rotate.rotate');
    aliasTool(app, 'grayscale', 'effects/common/grayscale.grayscale');
    aliasTool(app, 'brightness', 'effects/common/brightness.brightness');
    aliasTool(
        app,
        'backgroundReplace',
        'effects/backgroundReplace.backgroundReplace'
    );
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function aliasTool(app, toolName, menuName) {
    const toolbarItem = document.querySelector(`span.item[id="${toolName}"]`);
    if (!toolbarItem) {
        console.warn(`Toolbar item ${toolName} not found`);
        return;
    }

    toolbarItem.addEventListener('click', () => {
        // this should work since it is exactly what the menu is doing, but it does not
        // it errors and breaks the tools
        app.GUI.GUI_menu.emit('select_target', menuName, {
            parameters: null,
        });
    });
}

function removeFromConfig(config, name) {
    const index = config.TOOLS.findIndex((tool) => tool.name === name);
    if (index !== -1) {
        config.TOOLS.splice(index, 1);
    }
}

function modifyFromConfig(config, name) {
    const index = config.TOOLS.findIndex((tool) => tool.name === name);
    if (index !== -1) {
        return config.TOOLS[index];
    }
}

function insertAfterConfig(config, name, tool) {
    const index = config.TOOLS.findIndex((tool) => tool.name === name);
    if (index === -1) throw `Tool ${name} not found`;
    config.TOOLS.splice(index + 1, 0, tool);
}

export function tweakConfig(config) {
    // config tweaker
    config.MIN_WIDTH = document.getElementById('minWidth');
    config.MIN_HEIGHT = document.getElementById('minHeight');
    config.COLOR = '#757575';
    config.RATIO = 1.25;
    config.REQUIRE_CROP = document.getElementById('requireCrop');
    config.REQUIRE_DIMENSIONS = document.getElementById('requireDimensions');
    config.ASPECT = false;

    config.need_render = true;

    removeFromConfig(config, 'selection');

    modifyFromConfig(config, 'crop').crop = undefined;
    modifyFromConfig(config, 'crop').apply_Crop = true;

    insertAfterConfig(config, 'crop', {
        name: 'rotate',
        title: 'Rotate',
        attributes: {},
    });

    insertAfterConfig(config, 'fill', {
        name: 'backgroundReplace',
        title: 'Background Replace',
        attributes: {},
    });

    insertAfterConfig(config, 'fill', {
        name: 'brightness',
        title: 'Brightness/Contrast',
        attributes: {},
    });

    insertAfterConfig(config, 'fill', {
        name: 'grayscale',
        title: 'Grayscale',
        attributes: {},
    });

    removeFromConfig(config, 'gradient');
}

function lastItem(items) {
    return items[items.length - 1];
}

export function interceptMenuItem(app, target, object) {
    const [area, name] = target.split('.');
    switch (area) {
        case 'shapes':
            app.GUI_tools.activate_tool(name);
            return true;
        default:
            return false;
    }
}