import config from './config.js';

import alertify from '../../node_modules/alertifyjs/build/alertify.min.js';

export const enableDrawCenters = false;

export function setAspect(config) {
    config.ASPECT = (config.HEIGHT / config.WIDTH).toFixed(2) == config.RATIO;
}

export function reportError(message) {
    alertify.confirm(message);
}

export function updateDialogSize(dialog) {
    const imageLoadedElement = document.getElementById('ImageLoaded');
    if (!imageLoadedElement) {
        warn(`ImageLoaded element not found`);
        return;
    }
    dialog.width_mini = imageLoadedElement.naturalWidth;
    dialog.height_mini = imageLoadedElement.naturalHeight;
}

export function updateConfigurationSize(config) {
    const sizer = document.getElementById('ImageLoaded');
    if (!sizer) {
        warn(`'ImageLoaded' element not found`);
        return;
    }
    config.WIDTH = sizer.naturalWidth;
    config.HEIGHT = sizer.naturalHeight;
}

export function updateConfigurationVisibleSize(config) {
    const sizer = document.getElementById('canvas_minipaint');
    if (!sizer) {
        warn(`'canvas_minipaint' element not found`);
        return;
    }
    config.visible_width = sizer.width;
    config.HEIGHT = sizer.height;
}

export function updatePreviewSize(preview) {
    var sizer = document.getElementById('canvas_preview_wrapper_target');
    if (!sizer) {
        warn(`'canvas_preview_wrapper_target' element not found`);
        return;
    }
    preview.PREVIEW_SIZE.w = sizer.offsetWidth;
    preview.PREVIEW_SIZE.h = sizer.offsetHeight;
}

export async function injectPopupSaveCopyHandler(config) {
    await sleep(2000);
    const target = document.getElementById('popup_saveCopy');
    if (!target) {
        warn(`popup_saveCopy element not found`);
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
        warn(`canvas_preview element not found`);
        return;
    }
    return canvasPreview.width > canvasPreview.height;
}

export function tweakMenuDefinition(menuDefinition) {
    {
        const fileMenuGroup = findMenuDefinition(menuDefinition, 'File');
        removeMenuItem(fileMenuGroup.children, 'New');

        const fileOpenMenuItem = findMenuDefinition(
            fileMenuGroup.children,
            'Open',
        );
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
            },
        );

        appendMenuDefinition(fileMenuGroup.children, saveAndReturnMenuItem, {
            name: 'Cancel Image Editing',
            target: 'file/print.print', // TODO: goBack()
        });
    }

    {
        const editMenuGroup = findMenuDefinition(menuDefinition, 'Edit');
        appendMenuDefinition(
            editMenuGroup.children,
            findMenuDefinition(editMenuGroup.children, 'Redo'),
            {
                name: 'Restore Original Image',
                target: 'edit/restore.restore',
            },
        );

        removeMenuItem(editMenuGroup.children, 'Select All');
    }
    {
        const imageMenuGroup = findMenuDefinition(menuDefinition, 'Image');
        removeMenuItem(imageMenuGroup.children, 'Color Palette');
    }

    {
        const layerMenuGroup = findMenuDefinition(menuDefinition, 'Layer');
        removeMenuItem(layerMenuGroup.children, 'Composition');
    }

    {
        const effectsMenuGroup = findMenuDefinition(menuDefinition, 'Effects');
        const commonFiltersMenuGroup = findMenuDefinition(
            effectsMenuGroup.children,
            'Common Filters',
        );

        'Black and White,Box Blur,Denoise,Dither,Dot Screen,Edge,Emboss,Enrich,Grains,Heatmap,Mosaic,Oil,Sharpen,Solarize,Tilt Shift,Vignette,Vibrance,Vintage,Zoom Blur'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(effectsMenuGroup.children, menuTitle);
            });

        const grayscaleMenuItem = findMenuDefinition(
            commonFiltersMenuGroup.children,
            'Grayscale',
        );

        'Gaussian Blur,Brightness,Contrast,Grayscale,Hue Rotate,Negative,Saturate,Sepia,Shadow'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(commonFiltersMenuGroup.children, menuTitle);
            });

        // removeMenuItem(effectsMenuGroup.children, 'Common Filters');
        removeMenuItem(effectsMenuGroup.children, 'Instagram Filters');

        // Completely obliterate the existing 'Tools' menu
        removeMenuItem(menuDefinition, 'Tools');
        const toolsMenuGroup = appendMenuDefinition(
            menuDefinition,
            effectsMenuGroup,
            {
                name: 'Tools',
                children: [],
            },
        );

        appendMenuDefinition(toolsMenuGroup.children, null, grayscaleMenuItem);
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
        const addImageMenuItem = appendMenuDefinition(
            menuDefinition,
            toolsMenuGroup,
            {
                name: 'Add Image',
                children: [],
            },
        );

        const beardsMenuItem = appendMenuDefinition(
            addImageMenuItem.children,
            null,
            {
                name: 'Beards',
                children: [],
            },
        );

        'Blond,Brown,Black & White'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(beardsMenuItem.children, null, {
                name: menuTitle,
                target: `beard.${menuTitle.toLocaleLowerCase()}`,
            });
        });

        const moustachesMenuItem = appendMenuDefinition(
            addImageMenuItem.children,
            beardsMenuItem,
            {
                name: 'Moustaches',
                children: [],
            },
        );

        'Blond,Brown,Black & White'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(moustachesMenuItem.children, null, {
                name: menuTitle,
                target: `moustache.${menuTitle.toLocaleLowerCase()}`,
            });
        });

        const hatsMenuItem = appendMenuDefinition(
            addImageMenuItem.children,
            moustachesMenuItem,
            {
                name: 'Hats',
                children: [],
            },
        );

        'Brown,Black & White'.split(',').forEach((menuTitle) => {
            appendMenuDefinition(hatsMenuItem.children, null, {
                name: menuTitle,
                target: `hat.${menuTitle.toLocaleLowerCase()}`,
            });
        });

        const eyewearMenuItem = appendMenuDefinition(
            addImageMenuItem.children,
            hatsMenuItem,
            {
                name: 'Eyewear',
                children: [],
            },
        );

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

export function tweakMousePosition(state) {
    const selectActive = $('#select').hasClass('active');
    if (!selectActive) return;

    const {
        config,
        settings,
        is_drag_type_left,
        is_drag_type_right,
        is_drag_type_top,
        is_drag_type_bottom,
        dx,
    } = state;

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
    // prevent prompting user when navigating away
    app.GUI.Tools_settings.save_setting('exit_confirm', false);
    const tools_container = document.getElementById('tools_container');
    const toolbarItems = Array.from(
        tools_container.querySelectorAll('span.item'),
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
        'effects/backgroundReplace.backgroundReplace',
    );
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
        default:
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
