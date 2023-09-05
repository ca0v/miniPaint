import { Base_action } from '../../actions/base.js';
import { verbose } from '../log.js';

export class Generic_action extends Base_action {
    constructor(cropper, { why, doit, undo }) {
        super('generic_dw_lasso_action', 'dw_lasso Changes');
        this.cropper = cropper; //not used
        this._why = why;
        this._doit = doit;
        this._undo = undo;
    }

    async do() {
        super.do();
        verbose(`generic do: ${this._why}`);
        this._doit();
        this.cropper.renderData();
    }

    async undo() {
        verbose(`generic undo: ${this._why}`);
        this._undo();
        super.undo();
        this.cropper.renderData();
    }
}
