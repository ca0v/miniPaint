/**
 * ---------------------------------------------------------------------
 * Magic Crop Tool
 * ---------------------------------------------------------------------
 * status values: ready, drawing, placing, editing, hover, dragging, done
 * ready - tool has been initialized and is listening for 1st click
 * drawing - tool has placed a point
 * placing - user is moving mouse deciding where to place the next point
 * editing - user has closed the polygon and can now add/move/delete vertices
 * hover - user is hovering over a vertex or midpoint
 * before_dragging - pragmatic state for capturing undo/redo data
 * dragging - user is dragging a vertex or midpoint
 * done - user has clicked the "Magic Crop" button, all points are cleared
 *
 * ** KNOWN ISSUES **
 * - draw a shape, convert to raster then clip it...the right edge is not clipped
 *
 * ** TODO **
 * - panViewport and panViewport2 can be combined?
 */
import app from '../app.js';
import config from '../config.js';
import Base_tools_class from '../core/base-tools.js';
import Base_layers_class from '../core/base-layers.js';
import GUI_preview_class from '../core/gui/gui-preview.js';
import alertify from 'alertifyjs/build/alertify.min.js';
import Base_state_class from '../core/base-state.js';
import zoomView from './../libs/zoomView.js';
import { Status } from './dw_extensions/Status.js';
import { Drawings } from './dw_extensions/Drawings.js';
import { Keyboard } from './dw_extensions/Keyboard.js';
import { Settings } from './dw_extensions/Settings.js';
import { Generic_action } from './dw_extensions/Generic_action.js';
import { Update_layer_action } from './dw_extensions/Update_layer_action.js';
import { circle } from './dw_extensions/circle.js';
import { cross, plus } from './dw_extensions/dot.js';
import { center } from './dw_extensions/center.js';
import { getBoundingBox } from './dw_extensions/getBoundingBox.js';
import { distance } from './dw_extensions/distance.js';
import { age } from './dw_extensions/age.js';
import { angleOf } from './dw_extensions/angleOf.js';
import { debounce } from './dw_extensions/debounce.js';
import { clockwise } from './dw_extensions/clockwise.js';
import { Smooth } from './dw_extensions/Smooth.js';
import { Tests } from './dw_extensions/Tests.js';
import { StateMachine } from './dw_extensions/StateMachine.js';
import { log } from './dw_extensions/log.js';

async function doActions(actions) {
    await app.State.do_action(
        new app.Actions.Bundle_action(
            'dw_lasso_tool',
            'Magic Crop Tool',
            actions,
        ),
    );
}

export default class DwLasso_class extends Base_tools_class {
    constructor(ctx) {
        // without this change I could not do mouse operations after touch operations, the coordinates did not change
        const allowSystemToTrackMouseCoordinates = true;
        super(allowSystemToTrackMouseCoordinates);

        this.name = 'dw_lasso';
        this.ctx = ctx;
        this.data = [];

        this.metrics = {
            hover: { type: null, pointIndex: null, point: null },
            timeOfMove: Date.now(),
            lastPointMoved: null,
            prior_action_history_max: null,
            speed: 1,
            ACCELERATION: 0.3,
            MAX_SPEED: 25,
            MIN_SPEED: 1,
            DEFAULT_SPEED: 1,
            ACTION_HISTORY_MAX: 1000,
            DURATION_TO_SHOW_LAST_MOVE: 1000,
        };

        this.Base_layers = new Base_layers_class();
        this.Base_state = new Base_state_class();
        this.GUI_preview = new GUI_preview_class();

        this.delayedSnapshot = debounce((about) => {
            this.snapshot(about);
        }, Settings.delayedSnapshotTimeout);

        const delayRestoreCursor = debounce(() => {
            document
                .getElementById('canvas_wrapper')
                .classList.remove('dw_hideCursor');
        }, 1000);

        this.hideCursor = () => {
            document
                .getElementById('canvas_wrapper')
                .classList.add('dw_hideCursor');
            delayRestoreCursor();
        };
    }

    get scale() {
        return 1 / config.ZOOM;
    }

    on_activate() {
        // prevent activation if there is not already an image layer
        const imageLayers = config.layers.filter((l) => l.type === 'image');
        if (!imageLayers.length) {
            alertify.error(
                `Cannot activate ${this.name} tool without an image`,
            );
            return;
        }

        this.state = this.defineStateMachine();
        this.state.setCurrentState(Status.none);
        this.metrics.prior_action_history_max =
            this.Base_state.action_history_max;
        this.Base_state.action_history_max = this.metrics.ACTION_HISTORY_MAX;

        const layer = config?.layers.find((l) => l.type === this.name);

        if (!layer) {
            app.State.do_action(
                new app.Actions.Bundle_action(
                    'new_dw_lasso_layer',
                    'Magic Crop Layer',
                    [
                        new app.Actions.Insert_layer_action({
                            name: 'DW Lasso',
                            type: this.name,
                            params: this.clone(this.getParams()),
                            status: 'draft',
                            render_function: [this.name, 'render'],
                            x: 0,
                            y: 0,
                            width: config.WIDTH,
                            height: config.HEIGHT,
                            hide_selection_if_active: true,
                            rotate: null,
                            is_vector: true,
                            color: config.COLOR,
                        }),
                    ],
                ),
            );
        } else {
            // bring layer to the top
            while (app.Layers.find_next(layer.id))
                app.State.do_action(
                    new app.Actions.Reorder_layer_action(layer.id, 1),
                );
        }
    }

    on_leave() {
        if (!this.state) return;
        this.state.setCurrentState(Status.none);
        this.state.off();

        this.Base_state.action_history_max =
            this.metrics.prior_action_history_max;

        // delete the magic crop layer
        const actions = [new app.Actions.Reset_selection_action()];
        this.addDeleteToolAction(actions);
        return actions;
    }
    get status() {
        return this.state.currentState;
    }

    set status(value) {
        this.state.setCurrentState(value);
    }

    load() {
        // activate and deactivate handle lifecycle
    }

    /**
     * center the viewport on the given point
     * @param {x: number,y: number} point
     */
    centerAt(point) {
        const { x: px, y: py } = point;
        const dx = -0.5 * config.visible_width * this.scale;
        const dy = -0.5 * config.visible_height * this.scale;
        this.GUI_preview.zoom_to_position(px + dx, py + dy);
    }

    renderData() {
        this.Base_layers.render();
    }

    render(ctx, layer) {
        this.drawMask(ctx);
        this.drawTool(ctx, layer);
    }

    drawMask(ctx) {
        const pointData = this.data;
        if (pointData.length < 3) return;

        // fill the entire ctx with a light gray except the polygon defined by the point data
        ctx.fillStyle = Drawings.fill.exclusionColor;
        ctx.beginPath();
        ctx.rect(0, 0, config.WIDTH, config.HEIGHT);
        const clockwiseData = clockwise(pointData);
        renderAsPath(ctx, clockwiseData);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = Drawings.fill.color;
        renderAsPath(ctx, pointData);
        ctx.closePath();
        ctx.fill();
    }

    drawTool(ctx, layer) {
        const data = this.data;
        if (!data.length) return;

        const { x, y } = layer;

        {
            //set styles
            const style = Drawings.edge[this.status] || Drawings.edge.default;
            ctx.strokeStyle = style.color;
            ctx.lineWidth = style.lineWidth * this.scale;
            ctx.translate(x, y);

            ctx.beginPath();
            renderAsPath(ctx, data);
            ctx.closePath();
            ctx.stroke();
        }

        const hoverInfo = this.getHoverInfo();
        const hoverIndex = hoverInfo?.pointIndex;
        const isMajorVertex = hoverInfo?.type === 'major';
        const isMinorVertex = hoverInfo?.type === 'minor';

        // now render the drag-points over the top of the lines
        data.forEach((currentPoint, i) => {
            if (
                currentPoint === this.metrics.lastPointMoved &&
                age(this.metrics.timeOfMove) <
                    this.metrics.DURATION_TO_SHOW_LAST_MOVE
            ) {
                cross(ctx, currentPoint, {
                    color: Drawings.lastMoveVertex.color,
                    size: Drawings.lastMoveVertex.size * this.scale,
                    lineWidth: Drawings.lastMoveVertex.lineWidth * this.scale,
                    gapSize: 2 * this.scale,
                });
            } else if (isMajorVertex && hoverIndex === i) {
                // draw cursor
                cross(ctx, currentPoint, {
                    color: Drawings.cursor.color,
                    size: Drawings.cursor.size * this.scale,
                    lineWidth: Drawings.cursor.lineWidth * this.scale,
                    gapSize: 2 * this.scale,
                });
            } else {
                // draw a circle
                circle(ctx, currentPoint, {
                    size: Drawings.major.size * this.scale,
                    lineWidth: this.scale,
                    color: Drawings.major.color || Drawings.defaultStrokeColor,
                });
                //dot(ctx, currentPoint, { size: this.scale, color: Drawings.major.color });
            }
        });

        // also, draw semi-drag points at the centerpoint of each line
        data.forEach((currentPoint, i) => {
            const nextPoint = data[(i + 1) % data.length];
            // scale down the size based on the zoom level

            const centerPoint = center(currentPoint, nextPoint);

            if (isMinorVertex && hoverIndex === i) {
                plus(ctx, centerPoint, {
                    color: Drawings.cursor.color,
                    size: Drawings.cursor.size * this.scale,
                    lineWidth: Drawings.cursor.lineWidth * this.scale,
                });
            } else {
                if (this.status === Status.editing) {
                    // draw a circle
                    circle(ctx, centerPoint, {
                        size: Drawings.minor.size * this.scale,
                        color:
                            Drawings.minor.color || Drawings.defaultStrokeColor,
                        lineWidth: 1 * this.scale,
                    });
                }
            }
        });
    }

    snapshot(why, cb) {
        const action = new Update_layer_action(this, why, cb);
        app.State.do_action(action);
    }

    undoredo(why, doit, undo) {
        const action = new Generic_action(this, { why, doit, undo });
        app.State.do_action(action);
    }

    /**
     * do actual crop
     */
    async on_params_update(event) {
        switch (event.key) {
            case 'dw_cut':
                this.state.trigger(Keyboard.ClearInterior);
                this.getParams()[event.key] = true;
                break;
            case 'dw_crop':
                this.state.trigger(Keyboard.ClearExterior);
                break;
            case 'dw_reset':
                this.state.trigger(Keyboard.Reset);
                break;
            default:
                break;
        }
    }

    reset(about = 'before reset') {
        this.snapshot(about, () => {
            this.data = [];
            this.setHoverInfo(null, null);
        });
        this.renderData();
    }

    async cut() {
        const fillColor = config.COLOR;

        const imageLayers = config.layers.filter((l) => l.type === 'image');
        if (!imageLayers.length) {
            alertify.error('No image layers found');
            return;
        }

        const actions = [];

        // for each image layer, fill the selection with the background color
        imageLayers.forEach((imageLayer) => {
            const {
                x,
                y,
                width,
                height,
                width_original,
                height_original,
                link,
            } = imageLayer;
            const sx = width / width_original;
            const sy = height / height_original;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = link.width;
            canvas.height = link.height;

            // make a copy of the link canvas
            ctx.drawImage(link, 0, 0);

            // the clipping path needs to be transformed onto the target canvas
            ctx.scale(1 / sx, 1 / sy);
            ctx.translate(-x, -y);

            // draw the clipping path
            ctx.beginPath();
            renderAsPath(ctx, this.data);
            ctx.closePath();
            ctx.clip();

            if (!this.getParams().dw_transparent) {
                // fill the canvas with the background color
                ctx.fillStyle = fillColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
                // clear the canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }

            // replace the layer image with the new canvas
            actions.push(
                new app.Actions.Update_layer_image_action(
                    canvas,
                    imageLayer.id,
                ),
            );
        });

        // clear the data and reset the state
        this.reset();

        await doActions(actions);
    }

    async crop() {
        const data = this.data;
        if (data.length == 0) return;

        const actions = [];

        const bbox = getBoundingBox(data);
        const cropWidth = bbox.right - bbox.left;
        const cropHeight = bbox.bottom - bbox.top;

        const cropTop = bbox.top;
        const cropLeft = bbox.left;

        const imageLayers = config.layers.filter((l) => l.type === 'image');
        if (!imageLayers.length) {
            alertify.error('No image layers found');
            return;
        }

        imageLayers.forEach((imageLayer) => {
            const {
                x,
                y,
                width,
                height,
                width_original,
                height_original,
                link,
            } = imageLayer;

            // the source image may have been scaled
            const sx = width / width_original;
            const sy = height / height_original;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = link.width;
            canvas.height = link.height;

            // make a copy of the link canvas
            ctx.drawImage(link, 0, 0);

            // the clipping path needs to be transformed onto the target canvas
            ctx.scale(1 / sx, 1 / sy);
            ctx.translate(-x, -y);

            // crop everything outside the polygon
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = config.COLOR;
            ctx.beginPath();
            renderAsPath(ctx, data);
            ctx.closePath();
            ctx.fill();

            if (!this.getParams().dw_transparent) {
                // now create a solid background
                const background = document
                    .createElement('canvas')
                    .getContext('2d');
                background.canvas.width = canvas.width;
                background.canvas.height = canvas.height;
                background.fillStyle = config.COLOR;
                background.fillRect(0, 0, canvas.width, canvas.height);
                // now copy the cropped image onto the background
                background.drawImage(canvas, 0, 0);
                actions.push(
                    new app.Actions.Update_layer_image_action(
                        background.canvas,
                        imageLayer.id,
                    ),
                );
            } else {
                actions.push(
                    new app.Actions.Update_layer_image_action(
                        canvas,
                        imageLayer.id,
                    ),
                );
            }
        });

        this.reset('before cropping');

        await doActions(actions);
    }

    addDeleteToolAction(actions) {
        config.layers
            .filter((l) => l.type === this.name)
            .map((l) => {
                actions.push(new app.Actions.Delete_layer_action(l.id));
            });
    }

    mousePoint(e) {
        const mouse = this.get_mouse_info(e);
        if (mouse.click_valid == false) return null;
        return {
            x: Math.max(0, Math.min(config.WIDTH, mouse.x)),
            y: Math.max(0, Math.min(config.HEIGHT, mouse.y)),
        };
    }

    clonePoint() {
        const lastPoint = this.data.at(-1);
        if (!lastPoint) return;
        const newPoint = { x: lastPoint.x, y: lastPoint.y };
        this.data.push(newPoint);
        this.setHoverInfo('major', this.data.length - 1);
        this.renderData();
    }

    insertPointBeforeHoverLocation() {
        const hoverInfo = this.getHoverInfo();
        if (!hoverInfo) return false;

        const isMinorVertex = hoverInfo.type === 'minor';
        if (isMinorVertex) return false;

        const { x, y } = hoverInfo.point;
        const index = hoverInfo.pointIndex;

        // if we are minimum distance away from the prior point, insert a point
        const priorPoint = this.data.at(
            (index - 1 + this.data.length) % this.data.length,
        );
        const d = distance(priorPoint, { x, y });
        if (d < Settings.minimalDistanceBetweenPoints * this.scale) {
            return false;
        }

        this.undoredo(
            `before cloning major vertex ${index}`,
            () => {
                this.data.splice(index, 0, { x, y });
                this.setHoverInfo('major', index + 1);
            },
            () => {
                this.data.splice(index, 1);
                this.setHoverInfo('major', index - 1);
            },
        );
    }

    placePointAtClickLocation(mouseEvent) {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;

        this.undoredo(
            `before placing point ${this.data.length + 1}`,
            () => {
                this.data.push(currentPoint);
                this.setHoverInfo('major', this.data.length - 1);
            },
            () => this.data.pop(),
        );
    }

    movingLastPointToMouseLocation(mouseEvent) {
        const currentPoint = this.mousePoint(mouseEvent);
        if (!currentPoint) return false;
        if (!this.data.length) return;
        const p = this.data.at(-1);
        p.x = currentPoint.x;
        p.y = currentPoint.y;
        this.setHoverInfo('major', this.data.length - 1);
        this.renderData();
    }

    defineStateMachine() {
        if (this.state) {
            this.state.off();
            this.data = [];
            this.setHoverInfo(null, null);
        }
        this.state = new StateMachine(Object.values(Status));

        this.state.on('stateChanged', () => {
            const wrapper = document.getElementById('canvas_wrapper');
            // remove anything that starts with 'dw_'
            wrapper.classList.forEach((c) => {
                if (c.startsWith('dw_')) wrapper.classList.remove(c);
            });
            wrapper.classList.add(`dw_${this.state.currentState}`);
        });

        this.state.on('execute', (context) => {
            log(
                `${context.when}: ${context.about} (state: ${context.from} -> ${this.status})`,
            );
        });

        this.state.on('PressDrag', (dragEvent) => {
            // nothing to do
        });

        // surfacing for visibility, will not customize
        this.state.on('Pinch', (dragEvent) => {
            this.state.trigger('Pinch', dragEvent);
        });

        // surfacing for visibility, will not customize
        this.state.on('Spread', (dragEvent) => {
            this.state.trigger('Spread', dragEvent);
        });

        this.state.on('DragDrag', (dragEvent) => {
            const {
                dragDirectionInDegrees: degrees,
                dragDistanceInPixels: distance,
            } = dragEvent;

            const draggingUp = closeTo(degrees, -90);
            const draggingRight = closeTo(degrees, 0);
            const draggingDown = closeTo(degrees, 90);
            const draggingLeft = closeTo(degrees, 180);

            const eventName = `DragDrag${
                draggingUp
                    ? 'Up'
                    : draggingRight
                    ? 'Right'
                    : draggingDown
                    ? 'Down'
                    : draggingLeft
                    ? 'Left'
                    : ''
            }`;

            this.state.trigger(eventName, dragEvent);
        });

        const actions = this.state.actions;

        this.state.register({
            start: () => {},
            beforeDraggingHoverPoint: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;

                const hoverInfo = this.getHoverInfo();
                const isMajorVertex = hoverInfo?.type === 'major';
                const isMinorVertex = hoverInfo?.type === 'minor';
                const hoverIndex = hoverInfo?.pointIndex;

                if (isMajorVertex) {
                    const { x: original_x, y: original_y } =
                        this.data.at(hoverIndex);
                    let { x: redo_x, y: redo_y } = currentPoint;
                    this.undoredo(
                        `before dragging point ${hoverIndex} from ${original_x}, ${original_y}`,
                        () => {
                            const point = this.data.at(hoverIndex);
                            point.x = redo_x;
                            point.y = redo_y;
                        },
                        () => {
                            const point = this.data.at(hoverIndex);
                            redo_x = point.x;
                            redo_y = point.y;
                            point.x = original_x;
                            point.y = original_y;
                        },
                    );
                    // render the line
                    this.renderData();
                    return;
                }

                if (isMinorVertex) {
                    const index = hoverIndex;
                    this.undoredo(
                        `before dragging midpoint ${index}`,
                        () => this.data.splice(index + 1, 0, currentPoint),
                        () => this.data.splice(index + 1, 1),
                    );
                    this.setHoverInfo('major', index + 1);
                    // render the line
                    this.renderData();
                    return;
                }
            },
            draggingHoverPoint: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;

                const hoverPoint = this.getHoverPoint();

                if (hoverPoint) {
                    hoverPoint.x = currentPoint.x;
                    hoverPoint.y = currentPoint.y;
                    this.metrics.timeOfMove = Date.now();
                    this.metrics.lastPointMoved = hoverPoint;
                    this.renderData();
                } else {
                    log(`mousemove: no point to drag`);
                }
            },
            endDraggingHoverPoint: () => {},

            drawPoints: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;

                const data = this.data;
                const priorPoint = data.at(-2);
                if (!priorPoint) {
                    this.placePointAtClickLocation(mouseEvent);
                    return false;
                }

                const isSecondPoint = data.length === 2;

                const d = distance(priorPoint, currentPoint) / this.scale;
                let drawPoint =
                    d >
                    (isSecondPoint
                        ? Settings.minimalDistanceBetweenPoints
                        : Settings.distanceBetweenPoints);

                if (
                    !drawPoint &&
                    data.length > 2 &&
                    d > Settings.minimalDistanceBetweenPoints
                ) {
                    const a =
                        Math.PI -
                        angleOf(data.at(-3), priorPoint, currentPoint);
                    drawPoint =
                        d * a >
                        Settings.radiusThreshold *
                            Settings.distanceBetweenPoints;
                }
                if (drawPoint) {
                    data.push(currentPoint);
                    this.setHoverInfo('major', data.length - 1);
                } else {
                    const p = data.at(-1);
                    p.x = currentPoint.x;
                    p.y = currentPoint.y;
                }
                this.renderData();
                this.delayedSnapshot(
                    `before drawing points at location ${data.length}`,
                );
            },

            placeFirstPointAtMouseLocation: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;
                this.snapshot('before placing 1st point', () => {
                    this.data = [currentPoint];
                });
            },

            clonePoint: () => this.clonePoint(),
            insertPointBeforeHoverLocation: (e) =>
                this.insertPointBeforeHoverLocation(e),
            placePointAtClickLocation: (e) => this.placePointAtClickLocation(e),
            movingLastPointToMouseLocation: (e) =>
                this.movingLastPointToMouseLocation(e),

            movedLastPointToFirstPoint: (e) => {
                // if there are points and this is close to the first point, close the polygon
                if (this.data.length > 3) {
                    const firstPoint = this.data.at(0);
                    const lastPoint = this.data.at(-1);
                    const d = distance(firstPoint, lastPoint);
                    if (
                        d <
                        Settings.minimalDistanceBetweenPoints * this.scale
                    ) {
                        this.data.pop();
                        return true;
                    }
                    console.log(`movedLastPointToFirstPoint: ${d}`);
                }
                return false;
            },

            moveToPriorPoint: () => this.moveToNextVertex(-1),
            moveToNextPoint: () => this.moveToNextVertex(1),

            movePointLeft1Units: () => this.movePoint(-1, 0),
            movePointRight1Units: () => this.movePoint(1, 0),
            movePointUp1Units: () => this.movePoint(0, -1),
            movePointDown1Units: () => this.movePoint(0, 1),

            movePointUpLeft1Units: () => this.movePoint(-1, -1),
            movePointUpRight1Units: () => this.movePoint(1, -1),
            movePointDownLeft1Units: () => this.movePoint(-1, 1),
            movePointDownRight1Units: () => this.movePoint(1, 1),

            closePolygon: () => {},
            deletePointAndClosePolygon: () => {
                this.deletePoint();
            },
            dataPoints: () => !!this.data.length,
            noDataPoints: () => !this.data.length,

            deleteHoverPoint: () => {
                if (!this.getHoverPoint()) return false;
                this.deletePoint();
            },

            hoveringOverPoint: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;
                const priorHover = JSON.stringify(this.getHoverInfo() || null);
                const hover = this.computeHover(this.data, currentPoint);
                if (hover) {
                    // track the last point we were hovering over
                    this.setHoverInfo(hover.type, hover.pointIndex);
                }
                if (priorHover != JSON.stringify(hover)) {
                    this.renderData();
                }
                return !!hover;
            },

            notHoveringOverPoint: (e) => !actions.hoveringOverPoint(e),

            zoomIn: (e) => this.zoomViewport(e, 1),
            zoomOut: (e) => this.zoomViewport(e, -1),
            panLeft: (e) => this.panViewport2(e, 1, 0),
            panRight: (e) => this.panViewport2(e, -1, 0),
            panUp: (e) => this.panViewport2(e, 0, 1),
            panDown: (e) => this.panViewport2(e, 0, -1),

            reset: () => this.reset(),
            cut: () => this.cut(),
            crop: () => this.crop(),

            smooth: () => {
                const isMajorVertex = this.getHoverInfo()?.type === 'major';
                const isMinorVertex = this.getHoverInfo()?.type === 'minor';
                if (isMajorVertex) return actions.smoothAroundVertex();
                if (isMinorVertex) return actions.smoothAroundMinorVertex();
                return actions.smoothAllData();
            },

            smoothAllData: () => {
                this.snapshot(
                    'before smoothing',
                    () => (this.data = new Smooth().smooth(this.data)),
                );
            },

            smoothAroundVertex: () => {
                const hoverInfo = this.getHoverInfo();
                if (!hoverInfo) return false;
                const index = hoverInfo.pointIndex;

                this.snapshot(`before smoothing around vertex ${index}`, () => {
                    const success = new Smooth().smoothAroundVertex(
                        this.data,
                        index,
                    );
                    if (success) {
                        this.setHoverInfo('major', index + 1);
                    }
                });
            },

            smoothAroundMinorVertex: () => {
                const hoverInfo = this.getHoverInfo();
                if (!hoverInfo) return false;
                const index = hoverInfo.pointIndex;

                this.snapshot(
                    `before smoothing around minor vertex ${index}`,
                    () => {
                        const success = new Smooth().smoothAroundMinorVertex(
                            this.data,
                            index,
                        );
                        if (success) {
                            this.setHoverInfo('major', index + 1);
                        }
                    },
                );
            },

            centerAt: () => {
                const hoverInfo = this.getHoverInfo();
                if (!hoverInfo) return false;
                const isMajorVertex = hoverInfo.type === 'major';
                const isMinorVertex = hoverInfo.type === 'minor';

                if (isMajorVertex || isMinorVertex) {
                    this.centerAt(hoverInfo.point);
                    this.renderData();
                }
            },
        });

        this.state
            .about('no data found')
            .from(Status.none)
            .goto(Status.ready)
            .do(actions.noDataPoints);

        this.state
            .about('data found')
            .from(Status.none)
            .goto(Status.editing)
            .do(actions.dataPoints);

        this.state
            .about('reset the tool')
            .from([
                Status.editing,
                Status.drawing,
                Status.placing,
                Status.hover,
            ])
            .goto(Status.ready)
            .when(Keyboard.Reset)
            .do(actions.reset);

        this.state
            .about('clear the interior during an edit')
            .from([
                Status.editing,
                Status.drawing,
                Status.placing,
                Status.hover,
            ])
            .goto(Status.ready)
            .when(Keyboard.ClearInterior)
            .do(actions.cut);

        this.state
            .about('clear the exterior during an edit')
            .from([
                Status.editing,
                Status.drawing,
                Status.placing,
                Status.hover,
            ])
            .goto(Status.ready)
            .when(Keyboard.ClearExterior)
            .do(actions.crop);

        this.state
            .about('inject smoothing points into the polygon')
            .from([Status.editing, Status.hover, Status.placing])
            .when(Keyboard.Smooth)
            .do(actions.smooth);

        this.state
            .about('center about the current point')
            .from([
                Status.editing,
                Status.drawing,
                Status.placing,
                Status.hover,
            ])
            .when(Keyboard.CenterAt)
            .do(actions.centerAt);

        this.state
            .about('prepare to drag this point')
            .from(Status.hover)
            .goto(Status.before_dragging)
            .when(['Left+mousedown', 'touchmove'])
            .do(actions.beforeDraggingHoverPoint);

        this.state
            .about('stop dragging this point')
            .from(Status.before_dragging)
            .goto(Status.hover)
            .when(['Left+mouseup', 'touchend'])
            .do(actions.beforeDraggingHoverPoint);

        this.state
            .about('begin dragging this point')
            .from(Status.before_dragging)
            .goto(Status.dragging)
            .when(['Left+mousemove', 'touchmove'])
            .do(actions.draggingHoverPoint);

        this.state
            .about('drag this point')
            .from(Status.dragging)
            .when(['Left+mousemove', 'touchmove'])
            .do(actions.draggingHoverPoint);

        this.state
            .about('automatically create vertices as mouse moves')
            .from(Status.drawing)
            .when(['Left+mousemove', 'touchmove'])
            .do(actions.drawPoints);

        this.state
            .about(
                'when moving the mouse, move the last point to the mouse location',
            )
            .from(Status.drawing)
            .goto(Status.placing)
            .when('mousemove')
            .do(actions.placePointAtClickLocation);

        this.state
            .about(`place a point at the mouse location behind the drag point`)
            .from([Status.dragging, Status.editing])
            .when(Keyboard.InsertPointAtCursorPosition)
            .do(actions.insertPointBeforeHoverLocation);

        this.state
            .about('stop dragging this point')
            .from(Status.dragging)
            .goto(Status.editing)
            .when(['Left+mouseup', 'touchend'])
            .do(actions.endDraggingHoverPoint);

        this.state
            .about('create the 1st point of the polygon')
            .from(Status.ready)
            .goto(Status.drawing)
            .when(['Left+mousedown', 'touchmove'])
            .do(actions.placeFirstPointAtMouseLocation);

        this.state
            .about('stop placing and enter drawing mode')
            .from(Status.placing)
            .goto(Status.drawing)
            .when(['Left+mousedown']);

        this.state
            .about('close poly when the last is also the first')
            .from(Status.placing)
            .goto(Status.editing)
            .when('mousemove')
            .do(actions.movedLastPointToFirstPoint);

        this.state
            .about('continue moving the last point to the mouse location')
            .from(Status.placing)
            .when('mousemove')
            .do(actions.movingLastPointToMouseLocation);

        this.state
            .about('add a point to the polygon')
            .from(Status.drawing)
            .when(['Left+mousedown', 'touchmove', 'touchstart'])
            .do(actions.placePointAtClickLocation);

        this.state
            .about('add a point to the polygon')
            .from(Status.placing)
            .when(Keyboard.ClonePoint)
            .do(actions.clonePoint);

        this.state
            .about('zoom')
            .from([
                Status.drawing,
                Status.hover,
                Status.editing,
                Status.ready,
                Status.placing,
            ])
            .when(Keyboard.ZoomIn)
            .do(actions.zoomIn)
            .butWhen(Keyboard.ZoomOut)
            .do(actions.zoomOut);

        this.state
            .about('pan')
            .from([
                Status.drawing,
                Status.hover,
                Status.editing,
                Status.ready,
                Status.placing,
            ])
            .when(Keyboard.PanLeft)
            .do(actions.panLeft)
            .butWhen(Keyboard.PanRight)
            .do(actions.panRight)
            .butWhen(Keyboard.PanUp)
            .do(actions.panUp)
            .butWhen(Keyboard.PanDown)
            .do(actions.panDown);

        this.state
            .about('set focus to sibling vertex')
            .from([Status.editing, Status.hover])
            .goto(Status.editing)
            .when(Keyboard.PriorVertex)
            .do(actions.moveToPriorPoint)
            .butWhen(Keyboard.NextVertex)
            .do(actions.moveToNextPoint);

        this.state
            .about('move the point')
            .from([Status.editing, Status.placing, Status.hover])
            .when(Keyboard.MovePointLeft)
            .do(actions.movePointLeft1Units)
            .butWhen(Keyboard.MovePointRight)
            .do(actions.movePointRight1Units)
            .butWhen(Keyboard.MovePointUp)
            .do(actions.movePointUp1Units)
            .butWhen(Keyboard.MovePointDown)
            .do(actions.movePointDown1Units)
            .butWhen(Keyboard.MovePointUpLeft)
            .do(actions.movePointUpLeft1Units)
            .butWhen(Keyboard.MovePointUpRight)
            .do(actions.movePointUpRight1Units)
            .butWhen(Keyboard.MovePointDownLeft)
            .do(actions.movePointDownLeft1Units)
            .butWhen(Keyboard.MovePointDownRight)
            .do(actions.movePointDownRight1Units);

        this.state
            .about(
                'after deleting the last point indicate we are ready for the 1st point',
            )
            .from(Status.editing)
            .goto(Status.ready)
            .when(Keyboard.Delete)
            .do(actions.noDataPoints);

        this.state
            .about('delete the hover point after dragging')
            .from(Status.editing)
            .when(Keyboard.Delete)
            .do(actions.deleteHoverPoint);

        this.state
            .about('delete the hover point')
            .from(Status.hover)
            .goto(Status.editing)
            .when(Keyboard.Delete)
            .do(actions.deleteHoverPoint);

        this.state
            .about('delete the hover point')
            .from(Status.hover)
            .goto(Status.editing)
            .when('Shift+Left+mousedown')
            .do(actions.deleteHoverPoint);

        this.state
            .about('mouse has moved over a point')
            .from(Status.editing)
            .goto(Status.hover)
            .when(['Shift+mousemove', 'mousemove', 'touchmove'])
            .do(actions.hoveringOverPoint);

        this.state
            .about('mouse is no longer over a point')
            .from(Status.hover)
            .goto(Status.editing)
            .when(['Shift+mousemove', 'mousemove', 'touchmove'])
            .do(actions.notHoveringOverPoint);

        this.state
            .about('complete the polygon')
            .from([Status.drawing, Status.placing])
            .goto(Status.editing)
            .when(Keyboard.ClosePolygon)
            .do(actions.closePolygon)
            .butWhen(Keyboard.DeleteAndClosePolygon)
            .do(actions.deletePointAndClosePolygon);

        this.state
            .about('delete the polygon and reset state')
            .from([Status.editing])
            .goto(Status.ready)
            .when(Keyboard.DeleteAndClosePolygon)
            .do(actions.reset);

        return this.state;
    }

    computeHover(data, currentPoint) {
        const pointIndex = data.findIndex((point) => {
            const distanceToCurrentPoint = distance(point, currentPoint);
            return (
                distanceToCurrentPoint < Drawings.hoverMajor.size * this.scale
            );
        });

        if (pointIndex > -1) return { type: 'major', pointIndex };

        // is the current point within 5 pixels of any of the midpoints of the lines?
        const midpointIndex = data.findIndex((point, i) => {
            const nextPoint = data[(i + 1) % data.length];
            const centerPoint = center(point, nextPoint);
            const distanceToCurrentPoint = distance(centerPoint, currentPoint);
            return (
                distanceToCurrentPoint < Drawings.hoverMinor.size * this.scale
            );
        });

        if (midpointIndex > -1) {
            return { type: 'minor', pointIndex: midpointIndex };
        }

        return null;
    }

    movePoint(dx, dy) {
        if (!dx && !dy) return; // nothing to do

        const timeOfLastMove = this.metrics.timeOfMove;
        this.metrics.timeOfMove = Date.now();
        // if the time between moves is short, then increase the speed, but if it's long, then reset the speed
        if (timeOfLastMove && this.metrics.timeOfMove - timeOfLastMove < 100) {
            this.metrics.speed = Math.max(
                this.metrics.MIN_SPEED,
                Math.min(
                    this.metrics.MAX_SPEED,
                    this.metrics.speed + this.metrics.ACCELERATION,
                ),
            );
        } else {
            this.metrics.speed = Math.max(
                this.metrics.DEFAULT_SPEED,
                this.metrics.speed -
                    (this.metrics.ACCELERATION *
                        (this.metrics.timeOfMove - timeOfLastMove)) /
                        30,
            );
        }

        dx *= this.metrics.speed * this.scale;
        dy *= this.metrics.speed * this.scale;

        const hoverInfo = this.getHoverInfo();
        const isMidpoint = hoverInfo?.type === 'minor';
        if (isMidpoint) {
            this.snapshot('before moving point', () => {
                this.data.splice(hoverInfo.pointIndex + 1, 0, hoverInfo.point);
            });
            this.setHoverInfo('major', hoverInfo.pointIndex + 1);
        }

        this.delayedSnapshot('point moved');
        const point = this.data.at(hoverInfo.pointIndex);
        point.x += dx;
        point.y += dy;
        this.metrics.timeOfMove = Date.now();
        this.metrics.lastPointMoved = point;
        this.Base_layers.render();
    }

    moveToNextVertex(indexOffset) {
        if (!indexOffset) return;

        const isMinor = this.getHoverInfo()?.type === 'minor';
        let pointIndex = this.getHoverInfo()?.pointIndex || 0;

        if (isMinor) {
            pointIndex += indexOffset;
            if (indexOffset < 0) pointIndex++;
            this.setHoverInfo(
                'major',
                (pointIndex + this.data.length) % this.data.length,
            );
        } else {
            pointIndex += indexOffset;
            if (indexOffset > 0) pointIndex--;
            this.setHoverInfo(
                'minor',
                (pointIndex + this.data.length) % this.data.length,
            );
        }

        {
            // is point outside of viewport?
            const point = this.getHoverPoint();
            if (!point) throw `no hover point found`;
            const screenPoint = zoomView.toScreen(point);
            const { x, y } = screenPoint;
            const { width, height } = {
                width: config.visible_width,
                height: config.visible_height,
            };

            // if not within viewport, then center the viewport on the point
            if (x < 0 || x > width || y < 0 || y > height) {
                console.log(
                    `point: ${x}, ${y}`,
                    `viewport: ${width}, ${height}`,
                );
                this.centerAt(point);
            }
        }
        this.Base_layers.render();
    }

    setHoverInfo(type, index) {
        this.metrics.hover = {
            type,
            pointIndex: index,
        };
    }

    getHoverInfo() {
        const hover = (this.metrics.hover = this.metrics.hover || {});

        const isMajor = hover.type === 'major';
        const isMinor = hover.type === 'minor';

        const pointIndex = hover.pointIndex;

        if (typeof pointIndex === 'number') {
            if (pointIndex >= this.data.length) {
                // invalid state, ignore it
                console.warn(
                    `invalid hover state: ${pointIndex}, the data was modified without updating the hover state`,
                );
                return null;
            }
            if (isMajor)
                hover.point = this.data.at(pointIndex % this.data.length);
            else if (isMinor)
                hover.point = center(
                    this.data.at(pointIndex % this.data.length),
                    this.data.at((pointIndex + 1) % this.data.length),
                );
        }
        return hover;
    }

    getHoverPoint() {
        return this.getHoverInfo()?.point;
    }

    zoomViewport(mouseEvent, zoom) {
        if (!zoom) return;

        // is this a pinch gesture?
        if (mouseEvent.touches?.length === 2) {
            const touch1 = mouseEvent.touches[0];
            const touch2 = mouseEvent.touches[1];
            const centerPoint = center(touch1, touch2);

            this.GUI_preview.zoom_data.x = centerPoint.x;
            this.GUI_preview.zoom_data.y = centerPoint.y;
            this.GUI_preview.zoom(zoom);
            return;
        }

        {
            // is there an hover point?
            const point = this.getHoverPoint();
            if (point) {
                const screenPoint = zoomView.toScreen(point);
                this.GUI_preview.zoom_data.x = screenPoint.x;
                this.GUI_preview.zoom_data.y = screenPoint.y;
                this.GUI_preview.zoom(zoom);
                return;
            }
        }

        this.undoredo(
            'before zooming',
            () => {
                this.GUI_preview.zoom(zoom);
            },
            () => {
                this.GUI_preview.zoom(-zoom);
            },
        );
        this.Base_layers.render();
    }

    panViewport(dx, dy) {
        if (!dx && !dy) return;
        dx = -Math.round(dx);
        dy = -Math.round(dy);

        let { x, y } = zoomView.getPosition();
        const currentPosition = { x: -x * this.scale, y: -y * this.scale };
        this.GUI_preview.zoom_to_position(
            currentPosition.x + dx,
            currentPosition.y + dy,
        );
    }

    panViewport2(e, dx, dy) {
        if (e) {
            const {
                dragDistanceInPixels: distance,
                dragDirectionInDegrees: degrees,
            } = e;
            if (distance) {
                dx = dy = 0;
                const draggingUp = closeTo(degrees, -90);
                const draggingDown = closeTo(degrees, 90);
                const draggingLeft = closeTo(degrees, 180);
                const draggingRight = closeTo(degrees, 0);

                if (draggingLeft) dx = -distance; // pan right
                else if (draggingRight) dx = distance; // pan left

                if (draggingUp) dy = -distance; // pan down
                else if (draggingDown) dy = distance; // pan up

                dx *= this.scale;
                dy *= this.scale;
            }
        }

        this.panViewport(dx, dy);
    }

    deletePoint() {
        if (!this.data.length) return false;
        const hoverInfo = this.getHoverInfo();
        if (!hoverInfo) return false;
        if (hoverInfo.type === 'minor') return false;

        const { point, pointIndex } = hoverInfo;
        if (typeof pointIndex !== 'number') return false;

        this.undoredo(
            'before deleting point',
            () => {
                this.data.splice(pointIndex, 1);
                this.setHoverInfo('major', pointIndex % this.data.length);
                console.log(`deleted point ${pointIndex}`);
            },
            () => {
                this.data.splice(pointIndex, 0, point);
                this.setHoverInfo('major', pointIndex);
            },
        );
    }
}

function renderAsPath(ctx, points) {
    if (!points.length) throw 'no data to render';
    const lastPoint = points.at(-1);
    ctx.moveTo(lastPoint.x, lastPoint.y);
    points.forEach((point) => ctx.lineTo(point.x, point.y));
}

function closeTo(expected, actual, tolerance = 70) {
    return Math.abs(expected - actual) < tolerance;
}

new Tests().tests();
