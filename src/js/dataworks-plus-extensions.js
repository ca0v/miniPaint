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
    const imageLoadedElement = document.getElementById('ImageLoaded');
    if (!imageLoadedElement) {
        console.warn(`ImageLoaded element not found`);
        return;
    }
    config.WIDTH = imageLoadedElement.naturalWidth;
    config.HEIGHT = imageLoadedElement.naturalHeight;
}

export function isLandscape() {
    const canvasPreview = document.getElementById('canvas_preview');
    if (!canvasPreview) {
        console.warn(`canvas_preview element not found`);
        return;
    }
    return canvasPreview.width > canvasPreview.height;
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

export function tweakLayout(app) {
    const tools_container = document.getElementById('tools_container');
    tools_container.style.width = '16rem';
    const toolbarItems = Array.from(
        tools_container.querySelectorAll('span.item')
    );
    toolbarItems.forEach((item) => {
        const title = item.getAttribute('title');
        if (title) {
            item.textContent = title;
        }
        // remove any classname that is not one of "item", "trn", "active"
        const classList = Array.from(item.classList);
        classList.forEach((className) => {
            if (!['item', 'trn', 'active'].includes(className)) {
                item.classList.remove(className);
            }
        });

        item.style.width = '100%';
        item.style.textAlign = 'center';
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

function aliasTool(app, toolName, menuName) {
    const toolbarItem = document.querySelector(`span.item[id="${toolName}"]`);
    if (!toolbarItem) {
        console.warn(`Toolbar item ${toolName} not found`);
        return;
    }

    const [moduleName, functionName] = menuName.split('.');
    const module = app.Tools.Base_gui.modules[moduleName];
    if (!module) {
        console.warn(`Module ${moduleName} not found`);
        return;
    }
    const f = module && module[functionName];
    if (!f) {
        console.warn(
            `Function ${functionName} not found in module ${moduleName}`
        );
        return;
    }

    toolbarItem.addEventListener('click', () => {
        f.apply(module);
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

'line,rectangle,circle,text,clone,blur,sharpen,desaturate'
    .split(',')
    .forEach((toolName) => {
        removeFromConfig(config, toolName);
    });

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
