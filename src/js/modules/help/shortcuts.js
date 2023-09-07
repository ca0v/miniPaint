import Dialog_class from './../../libs/popup.js';
import app from '../../app.js';
import DwLasso_class from './../../tools/lasso.js';

class Help_shortcuts_class {
    constructor() {
        this.POP = new Dialog_class();
    }

    //shortcuts
    shortcuts() {
        const settings = this.systemShortcutKeys();

        settings.params = settings.params.map((help) => ({
            title: `<kbd>${help.title}</kbd>`,
            html: `${help.value}`,
        }));

        // is the lasso the active tool?
        const activeTool = app.GUI.GUI_tools.active_tool;
        switch (activeTool) {
            case 'lasso': {
                const help = new DwLasso_class().help().map((help) => ({
                    title: `${help.shortcuts
                        .map((v) => `<kbd>${v}</kbd>`)
                        .join('<br/>')}`,
                    html: `${help.about}`,
                }));

                settings.params = settings.params.concat([
                    {
                        html: '<b>Lasso tool</b>',
                    },
                    ...help,
                ]);
                break;
            }
        }
        this.POP.show(settings);
    }

    systemShortcutKeys() {
        return {
            title: 'Keyboard Shortcuts',
            className: 'shortcuts',
            params: [
                { title: 'F', value: 'Auto Adjust Colors' },
                { title: 'F3 / &#8984; + F', value: 'Search' },
                { title: 'Ctrl + C', value: 'Copy to Clipboard' },
                { title: 'D', value: 'Duplicate' },
                { title: 'S', value: 'Export' },
                { title: 'G', value: 'Grid on/off' },
                { title: 'I', value: 'Information' },
                { title: 'N', value: 'New layer' },
                { title: 'O', value: 'Open' },
                { title: 'CTRL + V', value: 'Paste' },
                { title: 'F10', value: 'Quick Load' },
                { title: 'F9', value: 'Quick Save' },
                { title: 'R', value: 'Resize' },
                { title: 'L', value: 'Rotate left' },
                { title: 'U', value: 'Ruler' },
                { title: 'Shift + S', value: 'Save As' },
                { title: 'CTRL + A', value: 'Select All' },
                { title: 'H', value: 'Shapes' },
                { title: 'T', value: 'Trim' },
                { title: 'CTRL + Z', value: 'Undo' },
                { title: 'Scroll up', value: 'Zoom in' },
                { title: 'Scroll down', value: 'Zoom out' },
            ],
        };
    }
}

export default Help_shortcuts_class;
