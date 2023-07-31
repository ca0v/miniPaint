import config from './config.js';

import alertify from '../../node_modules/alertifyjs/build/alertify.min.js';
import { parse } from 'uuid';

export const enableDrawCenters = false;

export function setAspect(config) {
    config.ASPECT = (config.HEIGHT / config.WIDTH).toFixed(2) == config.RATIO;
}

export function reportError(message) {
    alertify.confirm(message);
}

export function updateDialogSize(dialog) {
    const sizer = document.querySelector('#ImageLoaded');
    if (!sizer) {
        warn(`#ImageLoaded element not found`);
        return;
    }

    dialog.width_mini = sizer.width;
    dialog.height_mini = sizer.height;
}

export function updateConfigurationSize(config) {
    const sizer = document.querySelector('#ImageLoaded');
    if (!sizer) {
        warn(`#ImageLoaded element not found`);
        return;
    }

    config.WIDTH = sizer.width;
    config.HEIGHT = sizer.height;
}

export function updateConfigurationVisibleSize(config) {
    if (!config) {
        warn(`config not defined`);
        return;
    }
    const sizer = document.getElementById('canvas_minipaint');
    if (!sizer) {
        warn(`'canvas_minipaint' element not found`);
        return;
    }
    log(`setting config.visible_width to ${sizer.width}`);
    config.visible_width = sizer.width;

    log(`setting config.HEIGHT to ${sizer.height}`);
    config.HEIGHT = sizer.height;
}

export function updatePreviewSize(preview) {
    if (!preview?.PREVIEW_SIZE) {
        warn(`preview.PREVIEW_SIZE not defined`);
    }

    // this element does not exist...but why are we wanting to modify the preview window size?
    const sizer = document.querySelector('.canvas_preview_wrapper');
    if (!sizer) {
        warn(`'.canvas_preview_wrapper' element not found`);
        return;
    }

    const canvas = document.querySelector('canvas#canvas_preview');
    if (!canvas) {
        warn(`'canvas#canvas_preview' element not found`);
        return;
    }

    const { width } = getComputedStyle(sizer);

    const sizerWidth = parseInt(width);
    const sizerHeight = sizerWidth * config.RATIO;

    log(`setting sizer height to ${sizerWidth}px`);
    sizer.style.height = sizerHeight + 'px';

    log(`setting PREVIEW_SIZE to ${sizerWidth}x${sizerHeight}`);
    preview.PREVIEW_SIZE.h = sizerHeight;
    canvas.height = sizerHeight;
}

export async function injectPopupSaveCopyHandler(options) {
    const { save } = options;
    await sleep(2000);
    const target = document.getElementById('popup_saveCopy');
    if (!target) {
        warn(`popup_saveCopy element not found`);
        return;
    }
    target.onclick = function () {
        if (config.REQUIRE_CROP?.value == '1') {
            if (config.ASPECT == true) {
                var img = save.prepareCavasForServerSave();

                $('#PMEditedPhoto').val(img);
                goSaveAndBack();
            } else {
                reportError('Image requires cropping before being saved.');
            }
        } else {
            var img = save.prepareCavasForServerSave();

            $('#PMEditedPhoto').val(img);
            goSaveAndBack();
        }
    };
}

export function isLandscape() {
    const canvasPreview = document.getElementById('canvas_preview');
    if (!canvasPreview) {
        warn(`canvas_preview element not found`);
        return;
    }
    return canvasPreview.width > canvasPreview.height;
}

export function tweakMenuDefinition(menuDefinition) {
    {
        const fileMenuGroup = findMenuDefinition(menuDefinition, 'File');
        removeMenuItem(fileMenuGroup.children, 'New');

        'Search Images,Save As,Save As Data URL,Quick Save,Quick Load'.split(',').forEach((menuTitle) => {
            removeMenuItem(fileMenuGroup.children, menuTitle);
        });

        const fileOpenMenuItem = findMenuDefinition(fileMenuGroup.children, 'Open');

        'Open URL,Open Data URL,Open Test Template,Open from Webcam'.split(',').forEach((menuTitle) => {
            removeMenuItem(fileOpenMenuItem.children, menuTitle);
        });

        const saveAndReturnMenuItem = appendMenuDefinition(fileMenuGroup.children, lastItem(fileMenuGroup.children), {
            name: 'Save and Return',
            target: 'file/save.dataworks_save_copy', // TODO: popup_saveCopy
        });

        appendMenuDefinition(fileMenuGroup.children, saveAndReturnMenuItem, {
            name: 'Cancel Image Editing',
            target: 'file/save.dataworks_save_and_go_back', // TODO: goBack()
        });
    }

    {
        const editMenuGroup = findMenuDefinition(menuDefinition, 'Edit');
        appendMenuDefinition(editMenuGroup.children, findMenuDefinition(editMenuGroup.children, 'Redo'), {
            name: 'Restore Original Image',
            target: 'edit/restore.restore',
        });

        removeMenuItem(editMenuGroup.children, 'Select All');
    }
    {
        const imageMenuGroup = findMenuDefinition(menuDefinition, 'Image');
        removeMenuItem(imageMenuGroup.children, 'Color Palette');
        appendMenuDefinition(imageMenuGroup.children, null, {
            name: 'Background Replace',
            ellipsis: true,
            target: 'image/dataworks-background_replace.backgroundReplace',
        });
    }

    {
        const layerMenuGroup = findMenuDefinition(menuDefinition, 'Layer');
        removeMenuItem(layerMenuGroup.children, 'Composition');
    }

    {
        const effectsMenuGroup = findMenuDefinition(menuDefinition, 'Effects');
        const commonFiltersMenuGroup = findMenuDefinition(effectsMenuGroup.children, 'Common Filters');

        'Borders,Blueprint,Night Vision,Pencil,Box Blur,Denoise,Dither,Dot Screen,Edge,Emboss,Grains,Heatmap,Mosaic,Oil,Solarize,Tilt Shift,Vignette,Vibrance,Vintage,Zoom Blur'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(effectsMenuGroup.children, menuTitle);
            });

        'Gaussian Blur,Hue Rotate,Negative,Sepia,Shadow'.split(',').forEach((menuTitle) => {
            removeMenuItem(commonFiltersMenuGroup.children, menuTitle);
        });

        // removeMenuItem(effectsMenuGroup.children, 'Common Filters');
        removeMenuItem(effectsMenuGroup.children, 'Instagram Filters');

        // Completely obliterate the existing 'Tools' menu
        removeMenuItem(menuDefinition, 'Tools');
        const toolsMenuGroup = appendMenuDefinition(menuDefinition, effectsMenuGroup, {
            name: 'Tools',
            children: [],
        });

        appendMenuDefinition(toolsMenuGroup.children, null, {
            divider: true,
        });

        // the "shapes" handler calls app.GUI_tools.activate_tool
        'Line,Rectangle,Ellipse,Text,Clone,Blur,Sharpen,Desaturate'
            .split(',')
            .reverse()
            .forEach((menuTitle) => {
                appendMenuDefinition(toolsMenuGroup.children, null, {
                    name: menuTitle,
                    target: `shapes.${menuTitle.toLocaleLowerCase()}`,
                });
            });
    }

    {
        const toolsMenuGroup = findMenuDefinition(menuDefinition, 'Tools');
        const addImageMenuItem = appendMenuDefinition(menuDefinition, toolsMenuGroup, {
            name: 'Add Image',
            children: [],
        });

        const beardsMenuItem = appendMenuDefinition(addImageMenuItem.children, null, {
            name: 'Beards',
            children: [],
        });

        'Blond,Brown,Black & White'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(beardsMenuItem.children, null, {
                name: menuTitle,
                target: `beard.${menuTitle.toLocaleLowerCase()}`,
            });
        });

        const moustachesMenuItem = appendMenuDefinition(addImageMenuItem.children, beardsMenuItem, {
            name: 'Moustaches',
            children: [],
        });

        'Blond,Brown,Black & White'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(moustachesMenuItem.children, null, {
                name: menuTitle,
                target: `moustache.${menuTitle.toLocaleLowerCase()}`,
            });
        });

        const hatsMenuItem = appendMenuDefinition(addImageMenuItem.children, moustachesMenuItem, {
            name: 'Hats',
            children: [],
        });

        'Brown,Black & White'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(hatsMenuItem.children, null, {
                name: menuTitle,
                target: `hat.${menuTitle.toLocaleLowerCase()}`,
            });
        });

        const eyewearMenuItem = appendMenuDefinition(addImageMenuItem.children, hatsMenuItem, {
            name: 'Eyewear',
            children: [],
        });

        'Black,Gold,Green'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(eyewearMenuItem.children, null, {
                name: menuTitle,
                target: `eyewear.${menuTitle.toLocaleLowerCase()}`,
            });
        });
    }

    {
        const helpMenuGroup = findMenuDefinition(menuDefinition, 'Help');
        // Report Issues
        removeMenuItem(helpMenuGroup.children, 'Report Issues');
        removeMenuItem(helpMenuGroup.children, 'About');
    }
}

function removeMenuItem(menuItems, name) {
    const index = menuItems.findIndex((item) => item.name === name);
    if (index < 0) {
        warn(`Menu item '${name}' not found`);
        return;
    }
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

export function tweakMousePosition(state) {
    const selectActive = $('#select').hasClass('active');
    if (!selectActive) return;

    const { config, settings, is_drag_type_left, is_drag_type_right, is_drag_type_top, is_drag_type_bottom, dx } =
        state;

    const dy = dx * config.RATIO;

    const minWidth = $('#minWidth').val();
    if (!minWidth) {
        log(`#minWidth not found`);
        return;
    }

    if (is_drag_type_left) {
        const newWidth = settings.data.width - dx;
        if (newWidth >= minWidth) {
            log(`left: updating width by ${dx}`);
            settings.data.x += dx;
            settings.data.width -= dx;
            return;
        }
    }

    if (is_drag_type_right) {
        const newWidth = settings.data.width + dx;
        if (newWidth >= minWidth) {
            log(`right: updating width by ${dx}`);
            settings.data.x += dx;
            settings.data.width += dx;
            return;
        }
    }
}

export function callIfImageTooSmall(layer, cb) {
    if (!config.REQUIRE_CROP?.value == '1') return;
    setTimeout(function () {
        if (layer.width_original < config.MIN_WIDTH || layer.height_original < config2.MIN_HEIGHT) {
            $('#errorModalDimensions').modal('show');
            cb();
        }
    }, 1000);
}

export function tweakLayout(app) {
    // prevent prompting user when navigating away
    app.GUI.Tools_settings.save_setting('exit_confirm', false);
    const tools_container = document.getElementById('tools_container');
    const toolbarItems = Array.from(tools_container.querySelectorAll('span.item'));
    toolbarItems.forEach((item) => {
        const title = item.getAttribute('title');
        if (title) {
            item.textContent = title;
        }
    });

    aliasTool(app, 'rotate', 'image/rotate.rotate');
    aliasTool(app, 'grayscale', 'effects/common/grayscale.grayscale');
    aliasTool(app, 'brightness', 'effects/common/brightness.brightness');
    aliasTool(app, 'backgroundReplace', 'effects/backgroundReplace.backgroundReplace');
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function aliasTool(app, toolName, menuName) {
    const toolbarItem = document.querySelector(`span.item[id="${toolName}"]`);
    if (!toolbarItem) {
        warn(`Toolbar item ${toolName} not found`);
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
    if (index === -1) {
        warn(`Tool ${name} not found`);
        return;
    }
    config.TOOLS.splice(index, 1);
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

    'selection,shape,media,text,clone,blur,sharpen,desaturate,bulge_pinch,animation'.split(',').forEach((name) => {
        removeFromConfig(config, name);
    });

    const crop = modifyFromConfig(config, 'crop');
    crop.crop = undefined;
    crop.apply_Crop = true;

    removeFromConfig(config, crop.name);
    insertAfterConfig(config, 'select', crop);

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

/**
 * The toolbar registers a click event which invokes activate_tool which fails when
 * the tool is not registered, this prevents that from happening.
 */
export function interceptToolbarItemClick(id) {
    switch (id) {
        case 'brightness':
        case 'grayscale':
        case 'rotate':
            return true;
        default:
            log(`no intercept for ${id}`);
            return false;
    }
}

export function interceptMenuItem(app, target, object) {
    const [area, name] = target.split('.');
    switch (area) {
        case 'shapes':
            log(`activate_tool: ${name}`);
            app.GUI_tools.activate_tool(name);
            return true;
        case 'beard':
            switch (name) {
                case 'blond':
                    blMustache();
                    break;
                case 'brown':
                    brMustache();
                    break;
                case 'black & white':
                default:
                    bwMustache();
                    break;
            }
            return true;
        case 'eyewear':
            switch (name) {
                case 'black':
                    eyes();
                    break;
                case 'gold':
                    geyes();
                    break;
                case 'green':
                default:
                    beyes();
                    break;
            }
            return true;
        case 'hat':
            switch (name) {
                case 'brown':
                    brHats();
                    break;
                case 'black & white':
                default:
                    bwHats();
                    break;
            }
            return true;
        case 'moustache':
            switch (name) {
                case 'blond':
                    blMustache();
                    break;
                case 'brown':
                    brMustache();
                    break;
                case 'black & white':
                default:
                    bwMustache();
                    break;
            }
            return true;
        case 'edit/restore':
            switch (name) {
                case 'restore':
                    if (typeof fnLoadOriginalImage === 'function') {
                        fnLoadOriginalImage();
                    } else {
                        warn(`fnLoadOriginalImage not found`);
                    }
                    return true;
                default:
                    return false;
            }
        default:
            log(`no intercept for ${target}`);
            return false;
    }
}

export function log(...messages) {
    console.log(...messages);
}

export function warn(...messages) {
    console.warn(...messages);
}

export function activateTool(toolName) {
    const target = document.querySelector(`#tools_container .${toolName}`);
    if (!target) {
        warn(`Tool ${toolName} not found`);
        return;
    }
    target.classList.add('active');
}

export function isModuleFunctionDefined(modules, options) {
    const { className, functionName } = options;
    if (!modules[className]) {
        log(`Module ${className} not found`);
        return false;
    }
    if (!modules[className].object) {
        log(`Module ${className} object not found`);
        return false;
    }
    if (!modules[className].object[functionName]) {
        log(`Module ${className} function ${functionName} not found`);
        return false;
    }
    return !!modules[className]?.object[functionName];
}

export function onFinishRotate(it, options) {
    return; // I do not understand the purpose of the below code
    const { config } = options;
    const [w, h] = [config.WIDTH, config.HEIGHT];
    it.PREVIEW_SIZE = { w, h };
    const canvas_preview = document.getElementById('canvas_preview');
    if (canvas_preview) {
        canvas_preview.width = w;
        canvas_preview.height = h;
    } else {
        warn(`canvas_preview is not defined`);
    }
    it.Base_gui.GUI_preview.PREVIEW_SIZE.w = w;
    it.Base_gui.GUI_preview.PREVIEW_SIZE.h = h;
}
