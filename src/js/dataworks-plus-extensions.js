import config from './config.js';
import alertify from '../../node_modules/alertifyjs/build/alertify.min.js';
import Tools_translate_class from './modules/tools/translate.js';

export function aspectRatioIsValid() {
    return Math.abs(config.WIDTH * config.RATIO - config.HEIGHT) < 1;
}

function hijackAlertify() {
    const error = alertify.error;
    const success = alertify.success;

    alertify.error = function (message) {
        message = translate(message);
        error.call(this, message);
    };

    alertify.success = function (message) {
        message = translate(message);
        success.call(this, message);
    };
}
hijackAlertify();

export const enableDrawCenters = false;

function translate(message) {
    const Tools_translate = new Tools_translate_class();
    const translations = Tools_translate.translations[message];
    if (translations) {
        message = translations[config.LANG] || message;
    }
    return message;
}

// this can now be deprecated and alertify.error used instead
export async function reportError(message) {
    const Tools_translate = new Tools_translate_class();
    const translations = Tools_translate.translations[message];
    if (translations) {
        message = translations[config.LANG] || message;
    }
    alertify.error(message);
}

/**
 * If an #ImageLoaded element exists, set the dialog size to match the element size.
 */
export function updateDialogSize(dialog) {
    const sizer = document.querySelector('#ImageLoaded');
    if (!sizer) {
        warn(`#ImageLoaded element not found`);
        return;
    }

    dialog.width_mini = sizer.width;
    dialog.height_mini = sizer.height;
}

/**
 * If an #ImageLoaded element exists, set the WIDTH and HEIGHT to match that element.
 * The config WIDTH and HEIGHT are used to size the main canvas.
 */
export function updateConfigurationSize(config) {
    const sizer = document.querySelector('#ImageLoaded');
    if (!sizer) {
        warn(`#ImageLoaded element not found`);
        return;
    }

    config.WIDTH = sizer.width;
    config.HEIGHT = sizer.height;
}

/**
 * If the passed object contains a PREVIEW_SIZE, set the "h"
 */
export function updatePreviewSize(preview) {
    if (!preview?.PREVIEW_SIZE) {
        warn(`preview.PREVIEW_SIZE not defined`);
    }

    const canvas = document.querySelector('canvas#canvas_preview');
    if (!canvas) {
        warn(`'canvas#canvas_preview' element not found`);
        return;
    }

    const sizerHeight = preview.PREVIEW_SIZE.w * config.RATIO;

    log(`setting --canvas-preview-height CSS variable to ${sizerHeight}px`);
    document.documentElement.style.setProperty(
        '--canvas-preview-height',
        sizerHeight + 'px',
    );

    log(`setting canvas_preview.height to ${sizerHeight}`);
    canvas.height = sizerHeight;
    preview.PREVIEW_SIZE.h = sizerHeight;
}

export function isLandscape() {
    const canvasPreview = document.getElementById('canvas_preview');
    if (!canvasPreview) {
        warn(`canvas_preview element not found`);
        return;
    }
    return canvasPreview.width > canvasPreview.height;
}

/**
 * Modifies the default layout of the menu
 */
export function tweakMenuDefinition(menuDefinition) {
    {
        const fileMenuGroup = findMenuDefinition(menuDefinition, 'File');
        removeMenuItem(fileMenuGroup.children, 'New');

        'Search Images,Save As,Save As Data URL,Quick Save,Quick Load'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(fileMenuGroup.children, menuTitle);
            });

        const fileOpenMenuItem = findMenuDefinition(
            fileMenuGroup.children,
            'Open',
        );

        'Open URL,Open Data URL,Open Test Template,Open from Webcam'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(fileOpenMenuItem.children, menuTitle);
            });

        const saveAndReturnMenuItem = appendMenuDefinition(
            fileMenuGroup.children,
            lastItem(fileMenuGroup.children),
            {
                name: 'Save and Return',
                target: 'file/save.dataworks_save_copy', // TODO: popup_saveCopy
            },
        );

        appendMenuDefinition(fileMenuGroup.children, saveAndReturnMenuItem, {
            name: 'Cancel Image Editing',
            target: 'file/save.dataworks_go_back', // TODO: goBack()
        });
    }

    {
        const editMenuGroup = findMenuDefinition(menuDefinition, 'Edit');

        appendMenuDefinition(
            editMenuGroup.children,
            findMenuDefinition(editMenuGroup.children, 'Redo'),
            {
                name: 'Undo All Changes',
                target: 'edit/undo.reset',
            },
        );

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

        'Effect browser,Borders,Blueprint,Night Vision,Pencil,Box Blur,Denoise,Dither,Dot Screen,Edge,Emboss,Grains,Heatmap,Mosaic,Oil,Solarize,Tilt Shift,Vignette,Vibrance,Vintage,Zoom Blur'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(effectsMenuGroup.children, menuTitle);
            });

        const commonFiltersMenuGroup = findMenuDefinition(
            effectsMenuGroup.children,
            'Common Filters',
        );
        'Gaussian Blur,Hue Rotate,Negative,Sepia,Shadow'
            .split(',')
            .forEach((menuTitle) => {
                removeMenuItem(commonFiltersMenuGroup.children, menuTitle);
            });

        // move commonFilters up one level
        'Brightness,Contrast,Grayscale,Saturate'
            .split(',')
            .reverse()
            .forEach((menuTitle) => {
                const menuDef = findMenuDefinition(
                    commonFiltersMenuGroup.children,
                    menuTitle,
                );
                removeMenuItem(commonFiltersMenuGroup.children, menuDef.name);
                appendMenuDefinition(
                    effectsMenuGroup.children,
                    commonFiltersMenuGroup,
                    menuDef,
                );
            });
        removeMenuItem(effectsMenuGroup.children, commonFiltersMenuGroup.name);
        appendMenuDefinition(effectsMenuGroup.children, null, {
            name: 'Background Replace',
            ellipsis: true,
            target: 'image/dataworks-background_replace.backgroundReplace',
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

export function callIfImageTooSmall(layer, cb) {
    if (!config.REQUIRE_CROP) return;
    sleep(1000).then(() => {
        if (config.MIN_WIDTH) {
            if (layer.width_original < config.MIN_WIDTH) {
                warn(
                    `Image width ${layer.width_original} is less than minimum ${config.MIN_WIDTH}`,
                );
                $('#errorModalDimensions').modal('show');
                cb();
                return;
            }
        }
        if (config.MIN_HEIGHT) {
            if (layer.height_original < config.MIN_HEIGHT) {
                warn(
                    `Image height ${layer.height_original} is less than minimum ${config.MIN_HEIGHT}`,
                );
                $('#errorModalDimensions').modal('show');
                cb();
                return;
            }
        }
    });
}

/**
 * Modify the toolbar
 */
export function tweakLayout(app) {
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
        'image/dataworks-background_replace.backgroundReplace',
    );
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

function hasQueryString(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has(name);
}

function getQueryString(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function isUndefined(value) {
    return typeof value === 'undefined';
}

function readSystemValue(name, defaultValue) {
    let result = $(`#${name}`).val();
    if (hasQueryString('debug') && hasQueryString(name))
        return getQueryString(name);
    if (!isUndefined(result)) return result;
    if (hasQueryString(name)) return getQueryString(name);
    return defaultValue;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Modify the system configuration
 */
export function tweakConfig(config) {
    // if there is a "debug" query string then set the debug flag
    config.DEBUG = hasQueryString('debug');

    // wait for the ux to render before reading settings from dom
    sleep(250).then(() => {
        config.MIN_WIDTH = parseInt(readSystemValue('minWidth', '0'));
        config.MIN_HEIGHT = parseInt(readSystemValue('minHeight', '0'));
        config.REQUIRE_DIMENSIONS =
            '1' === readSystemValue('requireDimensions', '0');
        config.REQUIRE_CROP = '1' === readSystemValue('requireCrop', '0');
    });
    config.COLOR = '#757575';
    config.RATIO = 1.25;
    config.need_render = true;

    'selection,shape,media,text,clone,blur,sharpen,desaturate,bulge_pinch,animation'
        .split(',')
        .forEach((name) => {
            modifyFromConfig(config, name).visible = false;
        });

    // modify the title of "Crop" action to "Apply Crop"
    const crop = modifyFromConfig(config, 'crop');
    delete crop.attributes.crop;
    crop.attributes['Apply Crop'] = true;

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
        title: 'Brightness',
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
            log(`interceptToolbarItemClick: no intercept for ${id}`);
            return false;
    }
}

/**
 * Intercept menu activity prevents needing to introduce methods to actual tools
 */
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
                    executeMethod('blBeard');
                    break;
                case 'brown':
                    executeMethod('brBeard');
                    break;
                case 'black & white':
                default:
                    executeMethod('bwBeard');
                    break;
            }
            return true;
        case 'eyewear':
            switch (name) {
                case 'black':
                    executeMethod('eyes');
                    break;
                case 'gold':
                    executeMethod('geyes');
                    break;
                case 'green':
                default:
                    executeMethod('beyes');
                    break;
            }
            return true;
        case 'hat':
            switch (name) {
                case 'brown':
                    executeMethod('brHats');
                    break;
                case 'black & white':
                default:
                    executeMethod('bwHats');
                    break;
            }
            return true;
        case 'moustache':
            switch (name) {
                case 'blond':
                    executeMethod('blMustache');
                    break;
                case 'brown':
                    executeMethod('brMustache');
                    break;
                case 'black & white':
                default:
                    executeMethod('bwMustache');
                    break;
            }
            return true;
        case 'edit/restore':
            switch (name) {
                case 'restore':
                    executeMethod('fnLoadOriginalImage');
                    return true;
                default:
                    return false;
            }
        default:
            log(`interceptMenuItem: no intercept for ${target}`);
            return false;
    }
}

function executeMethod(fnName) {
    if (typeof window[fnName] === 'function') {
        window[fnName]();
        return true;
    }
    warn(`function ${fnName} not found`);
    return false;
}

export function log(...messages) {
    if (!config.DEBUG) return;
    console.log(...messages);
}

export function warn(...messages) {
    if (config.DEBUG) console.warn(...messages);
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

export function healSelectionGeometry(selection) {
    const ratio = config.RATIO;
    const maxWidth = config.WIDTH;
    const maxHeight = config.HEIGHT;
    const minWidth = config.REQUIRE_DIMENSIONS ? config.MIN_WIDTH || 0 : 0;

    let { x, y, width } = selection;

    // enforce initial constraints
    width = Math.max(Math.min(width, maxWidth), minWidth);
    x = Math.max(Math.min(x, maxWidth - width), 0);
    y = Math.max(Math.min(y, maxHeight - width * ratio), 0);

    // if right overflows, slide left and reduce width as necessary
    if (x + width > maxWidth) {
        x = maxWidth - width;
        if (x < 0) {
            width += x;
            x = 0;
        }
    }

    // if bottom overflows, slide up and reduce width as necessary
    if (y + width * ratio > maxHeight) {
        y = maxHeight - width * ratio;
        if (y < 0) {
            width += y / ratio;
            y = 0;
        }
    }

    return { x, y, width, height: width * ratio };
}
