import { Base_action } from '../../actions/base.js';
import { dump } from './dump.js';
import { deep } from './deep.js';

export class Update_layer_action extends Base_action {
  constructor(cropper, about = 'no description provided', cb = null) {
    super('update_dw_lasso_data', 'dw_lasso Changes');
    this.cropper = cropper;
    this.about = about;
    this.cb = cb;

    this.cropperState = {
      isRedo: false,
      do: {
        data: deep(this.cropper.data),
        status: this.cropper.status,
      },
      undo: {
        data: null,
        status: '',
      },
    };
  }

  async do() {
    super.do();
    console.log(`do: ${this.about}`);
    if (this.cb) {
      if (this.cropperState.isRedo) {
        this.cropper.data = deep(this.cropperState.do.data);
        this.cropper.status = this.cropperState.do.status;
      }
      this.cb();
      this.cropper.Base_layers.render();
    } else if (this.cropperState.isRedo) {
      this.cropper.data = deep(this.cropperState.undo.data);
      this.cropper.status = this.cropperState.undo.status;
      this.cropper.Base_layers.render();
    } else {
      // nothing to do
    }
    dump(this.cropper);
  }

  async undo() {
    this.cropperState.isRedo = true;
    console.log(`undo: ${this.about}`);
    this.cropperState.undo.data = deep(this.cropper.data);
    this.cropperState.undo.status = deep(this.cropper.status);
    this.cropper.data = deep(this.cropperState.do.data);
    this.cropper.Base_layers.render();
    super.undo();
    dump(this.cropper);
  }

  free() {
    super.free();
  }
}