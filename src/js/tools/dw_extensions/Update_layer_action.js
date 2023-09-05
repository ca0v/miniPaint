import { Base_action } from '../../actions/base.js';
import { deep } from './deep.js';

function captureInto(source, target = {}) {
    target.data = deep(source.data);
    target.status = source.status;
    target.hoverInfo = { ...source.hoverInfo };
    return target;
}

export class Update_lasso_action extends Base_action {
    constructor(cropper, about = 'no description provided', cb = null) {
        super('update_dw_lasso_data', 'dw_lasso Changes');
        this.cropper = cropper;
        this.about = about;
        this.cb = cb;

        this.cropperState = {
            isRedo: false,
            do: {},
            undo: {},
        };
    }

    async do() {
        super.do();
        console.log(`do: ${this.about}`);
        if (this.cropperState.isRedo) {
            captureInto(this.cropperState.undo, this.cropper);
        } else {
            captureInto(this.cropper, this.cropperState.do);
        }
        this.cb && this.cb();
        this.cropper.renderData();
    }

    async undo() {
        this.cropperState.isRedo = true;
        console.log(`undo: ${this.about}`);
        captureInto(this.cropper, this.cropperState.undo);
        captureInto(this.cropperState.do, this.cropper);
        this.cropper.renderData();
        super.undo();
    }

    free() {
        super.free();
    }
}
