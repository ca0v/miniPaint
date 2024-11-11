# Enhancement Requests

## Image Edit Audit Trail

Enhancement Trail - System will record and track all enhancements made to source image

## Solution

The `Update_layer_image_action` is used to modify the underlying canvas.  It presently accepts a canvas and layer id as constructor parameters.  Add an additional parameter to accept a string that describes the enhancement.  The enhancement string will be used to track the enhancement history.

The enhancement history can be found in the app `auditTrail` (see `src/js/app.js`).