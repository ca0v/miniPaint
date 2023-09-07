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
 * - Space+Left+mousemove not drawing points in edit mode
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
import { Update_lasso_action } from './dw_extensions/Update_layer_action.js';
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
import { log, verbose, isDebug } from './dw_extensions/log.js';

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

        this.name = 'lasso';
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
            if (!isDebug) {
                new app.Actions.Activate_tool_action('select', true).do();
                return;
            }
        }

        this.state = this.defineStateMachine();
        documentStateMachine(this.state);
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
                            name: 'Lasso',
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
            this.bringToFront();
            // bring layer to the top
        }
    }

    bringToFront() {
        const layer = config?.layers.find((l) => l.type === this.name);
        if (!layer) return false;
        while (app.Layers.find_next(layer.id))
            app.State.do_action(
                new app.Actions.Reorder_layer_action(layer.id, 1),
            );
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

        const style = Drawings[this.status] || Drawings.defaults;

        // fill the entire ctx with a light gray except the polygon defined by the point data
        ctx.fillStyle = style.fill.exclusionColor;
        ctx.beginPath();
        ctx.rect(0, 0, config.WIDTH, config.HEIGHT);
        const clockwiseData = clockwise(pointData);
        renderAsPath(ctx, clockwiseData);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = style.fill.color;
        renderAsPath(ctx, pointData);
        ctx.closePath();
        ctx.fill();
    }

    drawTool(ctx, layer) {
        const data = this.data;
        if (!data.length) return;

        const { x, y } = layer;

        const style = Drawings[this.status] || Drawings.defaults;

        {
            //set styles
            ctx.strokeStyle = style.edge.color;
            ctx.lineWidth = style.edge.lineWidth * this.scale;
            ctx.translate(x, y);

            ctx.beginPath();
            renderAsPath(ctx, data);
            ctx.closePath();
            ctx.stroke();
        }

        const { pointIndex: hoverIndex, type } = this.getHoverInfo();
        const isMajorVertex = type === 'major';
        const isMinorVertex = type === 'minor';

        // now render the drag-points over the top of the lines
        data.forEach((currentPoint, i) => {
            if (
                currentPoint === this.metrics.lastPointMoved &&
                age(this.metrics.timeOfMove) <
                    this.metrics.DURATION_TO_SHOW_LAST_MOVE
            ) {
                cross(ctx, currentPoint, {
                    color: style.lastMoveVertex.color,
                    size: style.lastMoveVertex.size * this.scale,
                    lineWidth: style.lastMoveVertex.lineWidth * this.scale,
                    gapSize: 2 * this.scale,
                });
            } else if (isMajorVertex && hoverIndex === i) {
                // draw cursor
                cross(ctx, currentPoint, {
                    color: style.cursor.color,
                    size: style.cursor.size * this.scale,
                    lineWidth: style.cursor.lineWidth * this.scale,
                    gapSize: 2 * this.scale,
                });
            } else {
                circle(ctx, currentPoint, {
                    size: style.major.size * this.scale,
                    lineWidth: this.scale,
                    color: style.major.color || style.defaultStrokeColor,
                });
                //dot(ctx, currentPoint, { size: this.scale, color: style.major.color });
            }
        });

        // also, draw semi-drag points at the centerpoint of each line
        data.forEach((currentPoint, i) => {
            const nextPoint = data[(i + 1) % data.length];
            // scale down the size based on the zoom level

            const centerPoint = center(currentPoint, nextPoint);

            if (isMinorVertex && hoverIndex === i) {
                plus(ctx, centerPoint, {
                    color: style.cursor.color,
                    size: style.cursor.size * this.scale,
                    lineWidth: style.cursor.lineWidth * this.scale,
                });
            } else {
                if (this.status === Status.editing) {
                    // draw a circle
                    circle(ctx, centerPoint, {
                        size: style.minor.size * this.scale,
                        color: style.minor.color || style.defaultStrokeColor,
                        lineWidth: 1 * this.scale,
                    });
                }
            }
        });
    }

    snapshot(why, cb) {
        const action = new Update_lasso_action(this, why, cb);
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
            case 'apply_cut':
                this.state.trigger(Keyboard.ClearInterior[0]);
                this.getParams()[event.key] = true;
                break;
            case 'apply_crop':
                this.state.trigger(Keyboard.ClearExterior[0]);
                break;
            case 'apply_reset':
                this.state.trigger(Keyboard.Reset[0]);
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

            if (!this.getParams().transparent) {
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

            if (!this.getParams().transparent) {
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

    insertPointAfterHoverLocation() {
        const { type, pointIndex } = this.getHoverInfo();
        const isMinorVertex = type === 'minor';
        if (isMinorVertex) return false;

        const { x, y } = this.getHoverPoint();
        if (!this.allowInsertPoint(pointIndex, { x, y })) return false;

        this.undoredo(
            `before cloning major vertex ${pointIndex}`,
            () => {
                this.data.splice(pointIndex + 1, 0, { x, y });
                this.setHoverInfo('major', pointIndex + 1);
                verbose(`redo: hover ${pointIndex + 1}`);
            },
            () => {
                this.data.splice(pointIndex + 1, 1);
                this.setHoverInfo('major', pointIndex);
                verbose(`undo: hover ${pointIndex}`);
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
        return this.movingLastPointToLocation(currentPoint);
    }

    movingLastPointToLocation(currentPoint) {
        if (!this.data.length) return;
        const p = this.getDataAt(-1);
        p.x = currentPoint.x;
        p.y = currentPoint.y;
        this.setHoverInfo('major', this.data.length - 1);
        this.renderData();
    }

    getDataAt(index) {
        return this.data.at((index + this.data.length) % this.data.length);
    }

    allowInsertPoint(pointIndex, mouse) {
        if (this.data.length <= 1) {
            verbose(
                'allowInsertPoint',
                `can insert at ${pointIndex} because there are ${this.data.length} points}`,
            );
            return true;
        }

        const priorPoint = this.getDataAt(pointIndex - 1);
        const d = distance(priorPoint, mouse) / this.scale;
        let drawPoint =
            d >
            (this.data.length === 2
                ? Settings.minimalDistanceBetweenPoints
                : Settings.distanceBetweenPoints);

        if (drawPoint) {
            verbose(
                'allowInsertPoint',
                `can insert at ${pointIndex} because d=${d}`,
            );
        }

        if (!drawPoint) {
            if (d < Settings.minimalDistanceBetweenPoints) {
                verbose(
                    'allowInsertPoint',
                    `cannot insert at ${pointIndex} because the minimal distance has not been achieved`,
                );
                return false;
            }
            if (this.data.length <= 2) {
                verbose(
                    'allowInsertPoint',
                    `cannot insert at ${pointIndex} because angle cannot be computed`,
                );
                return false;
            }
            {
                const a =
                    Math.PI -
                    angleOf(this.getDataAt(pointIndex - 2), priorPoint, mouse);
                drawPoint =
                    d * a >
                    Settings.radiusThreshold * Settings.distanceBetweenPoints;

                if (drawPoint) {
                    verbose(
                        'allowInsertPoint',
                        `can insert at ${pointIndex} because d=${d} and a=${a}`,
                    );
                } else {
                    verbose(
                        'allowInsertPoint',
                        `cannot insert at ${pointIndex} because d=${d} and a=${a}`,
                    );
                }
            }
        }
        return drawPoint;
    }

    defineStateMachine() {
        if (this.state) {
            this.state.off();
            this.data = [];
            this.setHoverInfo(null, null);
        }
        const theState = new StateMachine(Object.values(Status));

        theState.on('stateChanged', () => {
            const wrapper = document.getElementById('canvas_wrapper');
            // remove anything that starts with 'dw_'
            wrapper.classList.forEach((c) => {
                if (c.startsWith('dw_')) wrapper.classList.remove(c);
            });
            wrapper.classList.add(`dw_${theState.currentState}`);
            verbose(`state: ${theState.currentState}`);
        });

        theState.on('execute', (context) => {
            this.bringToFront();
            verbose(
                `${context.when}: ${context.about} (state: ${context.from} -> ${
                    context.goto || this.status
                })`,
            );
        });

        {
            // super hack to prevent accidental drawings
            let dataCount;
            let startTime;

            theState.on('touch:begin', () => {
                startTime = Date.now();
                dataCount = this.data.length;
            });

            theState.on('touch:add', () => {
                const timeDiff = Date.now() - startTime;
                const dataDiff = this.data.length - dataCount;
                verbose('user touched with second finger', {
                    timeDiff,
                    dataDiff,
                    dataCount,
                });
                if (dataDiff > 0 && dataCount < 10 && timeDiff < 500) {
                    // this was a mistake, clear the data
                    setTimeout(() => {
                        this.reset('undo accidental touch');
                        this.status = Status.ready;
                    }, 100);
                }
            });
        }

        'touch:begin,touch:drag,touch:complete,touch:abort,touch:add,touch:remove'
            .split(',')
            .forEach((topic) => {
                theState.on(topic, (e) => {
                    verbose(topic);
                    theState.trigger(topic, e);
                });
            });

        // surfacing for visibility, will not customize
        theState.on('touch:pinch', (dragEvent) => {
            theState.trigger('Pinch', dragEvent);
        });

        // surfacing for visibility, will not customize
        theState.on('touch:spread', (dragEvent) => {
            theState.trigger('Spread', dragEvent);
        });

        theState.on('touch:dragdrag', (dragEvent) => {
            const directionIndex = Math.round(
                dragEvent.dragDirectionInDegrees / 90,
            );
            const direction = ['Right', 'Down', 'Left', 'Up'][directionIndex];
            console.log(
                `DragDrag${direction}`,
                dragEvent.dragDirectionInDegrees,
            );
            theState.trigger(`DragDrag${direction}`, dragEvent);
        });

        const actions = theState.actions;

        theState.register({
            start: () => {},
            beforeDraggingHoverPoint: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;

                const { type, pointIndex: hoverIndex } = this.getHoverInfo();
                const isMajorVertex = type === 'major';
                const isMinorVertex = type === 'minor';

                if (isMajorVertex) {
                    const { x: original_x, y: original_y } =
                        this.getDataAt(hoverIndex);
                    let { x: redo_x, y: redo_y } = currentPoint;
                    this.undoredo(
                        `before dragging point ${hoverIndex} from ${original_x}, ${original_y}`,
                        () => {
                            const point = this.getDataAt(hoverIndex);
                            point.x = redo_x;
                            point.y = redo_y;
                            this.setHoverInfo('major', hoverIndex);
                        },
                        () => {
                            const point = this.getDataAt(hoverIndex);
                            redo_x = point.x;
                            redo_y = point.y;
                            point.x = original_x;
                            point.y = original_y;
                            this.setHoverInfo('major', hoverIndex);
                        },
                    );
                    // render the line
                    this.renderData();
                    return;
                }

                if (isMinorVertex) {
                    this.undoredo(
                        `before dragging midpoint ${hoverIndex}`,
                        () => {
                            this.data.splice(hoverIndex + 1, 0, currentPoint);
                            this.setHoverInfo('major', hoverIndex + 1);
                        },
                        () => {
                            this.data.splice(hoverIndex + 1, 1);
                            this.setHoverInfo('minor', hoverIndex);
                        },
                    );
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
                const mouse = this.mousePoint(mouseEvent);
                if (!mouse) return false;

                const pointIndex = -1;

                if (this.allowInsertPoint(pointIndex, mouse)) {
                    this.undoredo(
                        `before drawing point ${this.data.length}`,
                        () => {
                            this.data.push(mouse);
                            this.setHoverInfo('major', pointIndex);
                        },
                        () => {
                            this.data.pop();
                            this.setHoverInfo('major', pointIndex);
                        },
                    );
                } else {
                    const p = this.getDataAt(pointIndex);
                    p.x = mouse.x;
                    p.y = mouse.y;
                    this.renderData();
                }
            },

            placeFirstPointAtMouseLocation: (mouseEvent) => {
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;
                this.snapshot('before placing 1st point', () => {
                    this.data = [currentPoint];
                });
            },

            insertPointBeforeHoverLocation: (e) =>
                this.insertPointAfterHoverLocation(e),

            placePointAtClickLocation: (e) => this.placePointAtClickLocation(e),

            movingLastPointToMouseLocation: (e) =>
                this.movingLastPointToMouseLocation(e),

            placePointAtSnapLocation: (mouseEvent) => {
                if (this.data.length < 2) return false;
                const currentPoint = this.mousePoint(mouseEvent);
                if (!currentPoint) return false;
                const priorPoint = this.getDataAt(-2);
                if (!priorPoint) return false;

                // is the line from the prior point to the current point more horizontal or vertical?
                const dx = Math.abs(priorPoint.x - currentPoint.x);
                const dy = Math.abs(priorPoint.y - currentPoint.y);
                if (dx > dy) {
                    currentPoint.y = priorPoint.y;
                } else {
                    currentPoint.x = priorPoint.x;
                }
                return this.movingLastPointToLocation(currentPoint);
            },

            cloneHoverPoint: () => {
                if (!this.data.length) return false;
                const lastPoint = this.getHoverPoint();
                if (!lastPoint) return false;
                const { pointIndex } = this.getHoverInfo();
                this.undoredo(
                    'before cloning last point',
                    () => {
                        this.data.splice(pointIndex + 1, 0, { ...lastPoint });
                        this.setHoverInfo('major', pointIndex + 1);
                    },
                    () => {
                        this.data.splice(pointIndex + 1, 1);
                        this.setHoverInfo('major', pointIndex);
                    },
                );
            },

            movedLastPointToFirstPoint: (e) => {
                // if there are points and this is close to the first point, close the polygon
                if (this.data.length <= 3) return false;
                const firstPoint = this.getDataAt(0);
                const lastPoint = this.getDataAt(-1);
                const d = distance(firstPoint, lastPoint);
                if (d > Settings.minimalDistanceBetweenPoints * this.scale)
                    return false;

                this.data.pop();
                this.snapshot('before closing polygon', () => {});
                return true;
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

            movePointNeighborUp: () => this.movePointNeighbor('up'),
            movePointNeighborDown: () => this.movePointNeighbor('down'),
            movePointNeighborLeft: () => this.movePointNeighbor('left'),
            movePointNeighborRight: () => this.movePointNeighbor('right'),

            closePolygon: () => {
                this.snapshot('before closing polygon');
            },
            deletePointAndClosePolygon: () => {
                this.deletePoint('before closing polygon');
            },
            dataPoints: () => !!this.data.length,
            noDataPoints: () => !this.data.length,
            deleteHoverPoint: () => {
                if (!this.getHoverPoint()) return false;
                this.deletePoint();
                if (this.data.length) this.moveIntoView();
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
            panFrom: (e) => {
                this.metrics.panFrom = { x: e.clientX, y: e.clientY };
                return false; // do not handle this event
            },
            panTo: (e) => {
                if (!this.metrics.panFrom) throw `panFrom not set`;
                const mouse = { x: e.clientX, y: e.clientY };
                const dx = mouse.x - this.metrics.panFrom.x;
                const dy = mouse.y - this.metrics.panFrom.y;
                this.metrics.panFrom = mouse;
                this.panViewport(dx * this.scale, dy * this.scale);
            },
            panLeft: (e) => this.panViewport2(e, 1, 0),
            panRight: (e) => this.panViewport2(e, -1, 0),
            panUp: (e) => this.panViewport2(e, 0, 1),
            panDown: (e) => this.panViewport2(e, 0, -1),

            reset: () => this.reset(),
            cut: () => this.cut(),
            crop: () => this.crop(),

            smooth: () => {
                const { type } = this.getHoverInfo();
                if (type === 'major') return actions.smoothAroundVertex();
                if (type === 'minor') return actions.smoothAroundMinorVertex();
                return actions.smoothAllData();
            },

            smoothAllData: () => {
                this.snapshot(
                    'before smoothing',
                    () => (this.data = new Smooth().smooth(this.data)),
                );
            },

            smoothAroundVertex: () => {
                const { pointIndex: index } = this.getHoverInfo();
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
                const { pointIndex: index } = this.getHoverInfo();
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
                const { type } = this.getHoverInfo();
                const isMajorVertex = type === 'major';
                const isMinorVertex = type === 'minor';

                if (isMajorVertex || isMinorVertex) {
                    this.centerAt(this.getHoverPoint());
                    this.renderData();
                }
            },
        });

        theState
            .about('no data found')
            .from([Status.none, Status.editing])
            .goto(Status.ready)
            .do(actions.noDataPoints);

        theState
            .about('data found')
            .from(Status.none)
            .goto(Status.editing)
            .do(actions.dataPoints);

        theState
            .about('reset the tool')
            .from([
                Status.editing,
                Status.drawing,
                Status.placing,
                Status.hover,
                Status.ready,
            ])
            .goto(Status.ready)
            .when(Keyboard.Reset)
            .do(actions.reset);

        theState
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

        theState
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

        theState
            .about('inject smoothing points into the polygon')
            .from([Status.editing, Status.hover, Status.placing])
            .when(Keyboard.Smooth)
            .do(actions.smooth);

        theState
            .about('center about the current point')
            .from([
                Status.editing,
                Status.dragging,
                Status.drawing,
                Status.placing,
                Status.hover,
            ])
            .when(Keyboard.CenterAt)
            .do(actions.centerAt);

        theState
            .about('prepare to drag this point')
            .from(Status.hover)
            .goto(Status.before_dragging)
            .when(Keyboard.StartDragging)
            .do(actions.beforeDraggingHoverPoint);

        theState
            .about('begin dragging this point')
            .from(Status.before_dragging)
            .goto(Status.dragging)
            .when(Keyboard.Dragging)
            .do(actions.draggingHoverPoint);

        theState
            .about('drag this point')
            .from(Status.dragging)
            .when(Keyboard.Dragging)
            .do(actions.draggingHoverPoint);

        theState
            .about('stop dragging this point')
            .from(Status.dragging)
            .goto(Status.editing)
            .when(Keyboard.EndDragging)
            .do(actions.endDraggingHoverPoint);

        theState
            .about('automatically create vertices as mouse moves')
            .from(Status.drawing)
            .when(Keyboard.Dragging)
            .do(actions.drawPoints);

        theState
            .about(
                'when moving the mouse, move the last point to the mouse location',
            )
            .from(Status.drawing)
            .goto(Status.placing)
            .when(Keyboard.PlacingVertex)
            .do(actions.placePointAtClickLocation);

        theState
            .about(`place a point at the mouse location behind the drag point`)
            .from([Status.dragging, Status.editing])
            .when(Keyboard.InsertPointAtCursorPosition)
            .do(actions.insertPointBeforeHoverLocation);

        theState
            .about('create the 1st point of the polygon')
            .from(Status.ready)
            .goto(Status.drawing)
            .when(Keyboard.PlaceFirstVertex)
            .do(actions.placeFirstPointAtMouseLocation);

        theState
            .about('continue moving the last point to the mouse location')
            .from([Status.placing])
            .when(Keyboard.PlacingVertex)
            .do(actions.movingLastPointToMouseLocation)
            .butWhen(Keyboard.PlacingVertexSnap)
            .do(actions.placePointAtSnapLocation);

        theState
            .about('continue moving the last point to the mouse location')
            .from([Status.placing, Status.drawing, Status.editing])
            .when(Keyboard.CloneVertex)
            .do(actions.cloneHoverPoint);

        theState
            .about('stop placing and enter drawing mode')
            .from(Status.placing)
            .goto(Status.drawing)
            .when(Keyboard.PlaceVertex);

        theState
            .about('close poly when the last is also the first')
            .from(Status.placing)
            .goto(Status.editing)
            .when(Keyboard.PlacingVertex)
            .do(actions.movedLastPointToFirstPoint);

        theState
            .about('add a point to the polygon')
            .from(Status.drawing)
            .when(Keyboard.Drawing)
            .do(actions.drawPoints);

        theState
            .about('zoom in')
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
            .about('zoom out')
            .do(actions.zoomOut);

        theState
            .about('pan left')
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
            .about('pan right')
            .do(actions.panRight)
            .butWhen(Keyboard.PanUp)
            .about('pan up')
            .do(actions.panUp)
            .butWhen(Keyboard.PanDown)
            .about('pan down')
            .do(actions.panDown)
            .butWhen(Keyboard.PanFrom)
            .about('pan from')
            .do(actions.panFrom)
            .butWhen(Keyboard.PanTo)
            .about('pan to')
            .do(actions.panTo);

        theState
            .about('go to prior vertex')
            .from([Status.hover, Status.editing])
            .goto(Status.editing)
            .when(Keyboard.PriorVertex)
            .do(actions.moveToPriorPoint)
            .butWhen(Keyboard.NextVertex)
            .about('go to next vertex')
            .do(actions.moveToNextPoint);

        theState
            .about('go to prior vertex while still placing points')
            .from([Status.placing])
            .when(Keyboard.PriorVertex)
            .do(actions.moveToPriorPoint)
            .butWhen(Keyboard.NextVertex)
            .about('go to next vertex while still placing points')
            .do(actions.moveToNextPoint);

        theState
            .about('move the point left')
            .from([
                Status.editing,
                Status.placing,
                Status.hover,
                Status.drawing,
            ])
            .when(Keyboard.MovePointLeft)
            .do(actions.movePointLeft1Units)
            .butWhen(Keyboard.MovePointRight)
            .about('move the point right')
            .do(actions.movePointRight1Units)
            .butWhen(Keyboard.MovePointUp)
            .about('move the point up')
            .do(actions.movePointUp1Units)
            .butWhen(Keyboard.MovePointDown)
            .about('move the point down')
            .do(actions.movePointDown1Units)
            .butWhen(Keyboard.MovePointUpLeft)
            .about('move the point up and left')
            .do(actions.movePointUpLeft1Units)
            .butWhen(Keyboard.MovePointUpRight)
            .about('move the point up and right')
            .do(actions.movePointUpRight1Units)
            .butWhen(Keyboard.MovePointDownLeft)
            .about('move the point down and left')
            .do(actions.movePointDownLeft1Units)
            .butWhen(Keyboard.MovePointDownRight)
            .about('move the point down and right')
            .do(actions.movePointDownRight1Units);

        theState
            .about('snap point to neighboring point')
            .from([Status.editing])
            .when(Keyboard.MovePointSnapUp)
            .do(actions.movePointNeighborUp)
            .butWhen(Keyboard.MovePointSnapDown)
            .do(actions.movePointNeighborDown)
            .butWhen(Keyboard.MovePointSnapLeft)
            .do(actions.movePointNeighborLeft)
            .butWhen(Keyboard.MovePointSnapRight)
            .do(actions.movePointNeighborRight);
        theState
            .about(
                'after deleting the last point indicate we are ready for the 1st point',
            )
            .from(Status.editing)
            .goto(Status.ready)
            .when(Keyboard.Delete)
            .do(actions.noDataPoints);

        theState
            .about('delete the hover point')
            .from([Status.editing, Status.hover])
            .goto(Status.editing)
            .when(Keyboard.Delete)
            .do(actions.deleteHoverPoint);

        theState
            .about('delete the hover point while still placing points')
            .from([Status.placing])
            .when(Keyboard.Delete)
            .do(actions.deleteHoverPoint);

        theState
            .about('mouse has moved over a point')
            .from(Status.editing)
            .goto(Status.hover)
            .when(Keyboard.Hover)
            .do(actions.hoveringOverPoint);

        theState
            .about('mouse is no longer over a point')
            .from(Status.hover)
            .goto(Status.editing)
            .when(Keyboard.Hover)
            .do(actions.notHoveringOverPoint);

        theState
            .about('complete the polygon')
            .from([Status.drawing, Status.placing])
            .goto(Status.editing)
            .when(Keyboard.ClosePolygon)
            .do(actions.closePolygon)
            .butWhen(Keyboard.DeleteAndClosePolygon)
            .about('delete the polygon and reset state')
            .do(actions.deletePointAndClosePolygon);

        theState
            .about('delete the polygon and reset state')
            .from([Status.editing])
            .goto(Status.ready)
            .when(Keyboard.DeleteAndClosePolygon)
            .do(actions.reset);

        return theState;
    }

    computeHover(data, currentPoint) {
        const style = Drawings[this.status] || Drawings.defaults;

        const pointIndex = data.findIndex((point) => {
            const distanceToCurrentPoint = distance(point, currentPoint);
            return distanceToCurrentPoint < style.hoverMajor.size * this.scale;
        });

        if (pointIndex > -1) return { type: 'major', pointIndex };

        // is the current point within 5 pixels of any of the midpoints of the lines?
        const midpointIndex = data.findIndex((point, i) => {
            const nextPoint = data[(i + 1) % data.length];
            const centerPoint = center(point, nextPoint);
            const distanceToCurrentPoint = distance(centerPoint, currentPoint);
            return distanceToCurrentPoint < style.hoverMinor.size * this.scale;
        });

        if (midpointIndex > -1) {
            return { type: 'minor', pointIndex: midpointIndex };
        }

        return null;
    }

    movePointNeighbor(direction) {
        const hoverPoint = this.getHoverPoint();
        if (!hoverPoint) return false;
        const { pointIndex } = this.getHoverInfo();
        const priorPoint = this.getDataAt(pointIndex - 1);
        if (!priorPoint) return false;
        const nextPoint = this.getDataAt(pointIndex + 1);
        if (!nextPoint) return false;

        let { x, y } = hoverPoint;

        switch (direction) {
            case 'up':
                y = Math.min(priorPoint.y, nextPoint.y);
                break;
            case 'down':
                y = Math.max(priorPoint.y, nextPoint.y);
                break;
            case 'left':
                x = Math.min(priorPoint.x, nextPoint.x);
                break;
            case 'right':
                x = Math.max(priorPoint.x, nextPoint.x);
                break;
            default:
                throw `invalid direction: ${direction}`;
        }
        hoverPoint.x = x;
        hoverPoint.y = y;
        this.renderData();
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

        const { pointIndex, type } = this.getHoverInfo();
        const isMinor = type === 'minor';
        if (isMinor) {
            const hoverPoint = this.getHoverPoint();
            this.undoredo(
                'before moving point',
                () => {
                    this.data.splice(pointIndex + 1, 0, hoverPoint);
                    this.setHoverInfo('major', pointIndex + 1);
                },
                () => {
                    this.data.splice(pointIndex + 1, 1);
                    this.setHoverInfo('minor', pointIndex);
                },
            );
        } else {
            const point = this.getDataAt(pointIndex);
            const { x, y } = point;
            this.metrics.timeOfMove = Date.now();
            this.metrics.lastPointMoved = point;
            this.undoredo(
                `before moving point ${pointIndex}`,
                () => {
                    point.x += dx;
                    point.y += dy;
                },
                () => {
                    point.x = x;
                    point.y = y;
                },
            );
        }
    }

    moveToNextVertex(indexOffset) {
        if (!indexOffset) return;

        const { type, pointIndex } = this.getHoverInfo();
        const isMinor = type === 'minor';

        if (isMinor) {
            let index = pointIndex + indexOffset;
            if (indexOffset < 0) index++;
            this.setHoverInfo('major', index);
        } else {
            let index = pointIndex + indexOffset;
            if (indexOffset > 0) index--;
            this.setHoverInfo('minor', index);
        }

        this.moveIntoView();
        this.Base_layers.render();
    }

    moveIntoView() {
        {
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
                this.centerAt(point);
            }
        }
    }

    setHoverInfo(type, pointIndex) {
        pointIndex = (pointIndex + this.data.length) % this.data.length;
        if (arguments.length === 1) {
            pointIndex = type.pointIndex;
            type = type.type;
        }
        this.metrics.hover = {
            type,
            pointIndex,
        };
    }

    get hoverInfo() {
        return this.getHoverInfo();
    }

    set hoverInfo(value) {
        this.setHoverInfo(value);
    }

    getHoverInfo() {
        return (this.metrics.hover = this.metrics.hover || {});
    }

    getHoverPoint() {
        const { pointIndex, type } = this.getHoverInfo();

        if (typeof pointIndex !== 'number') return null;
        const isMajor = type === 'major';
        const isMinor = type === 'minor';
        if (pointIndex >= this.data.length) {
            // invalid state, ignore it
            console.warn(
                `invalid hover state: ${pointIndex}, the data was modified without updating the hover state`,
            );
            return null;
        }

        if (isMajor) return this.getDataAt(pointIndex);

        if (isMinor)
            return center(
                this.getDataAt(pointIndex),
                this.getDataAt(pointIndex + 1),
            );

        return null;
    }

    zoomViewport(mouseEvent, zoom) {
        if (!zoom) return;

        // is this a pinch gesture?
        if (mouseEvent.physics && mouseEvent.physics.length === 2) {
            const { dragDistanceInPixels, physics } = mouseEvent;
            const [touch1, touch2] = physics.map((p) => p.position);
            const centerPoint = center(touch1, touch2);

            this.GUI_preview.zoom_data.x = centerPoint.x;
            this.GUI_preview.zoom_data.y = centerPoint.y;

            const scale = dragDistanceInPixels / config.visible_width;

            if (zoom > 0) {
                zoom = config.ZOOM * (1 + scale);
            } else {
                zoom = config.ZOOM / (1 + scale);
            }
            zoom *= 100;

            console.log(`zooming ${dragDistanceInPixels}, ${zoom}`);
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
        dx = Math.round(dx);
        dy = Math.round(dy);

        let { x, y } = zoomView.getPosition();
        const currentPosition = { x: x * this.scale, y: y * this.scale };
        this.GUI_preview.zoom_to_position(
            -(currentPosition.x + dx),
            -(currentPosition.y + dy),
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
                const draggingRight = closeTo(degrees, 0);
                const draggingDown = closeTo(degrees, 90);
                const draggingLeft = closeTo(degrees, 180);
                const draggingUp = closeTo(degrees, 270);

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

    deletePoint(why = 'before deleting point') {
        if (!this.data.length) return false;
        const { pointIndex, type } = this.getHoverInfo();
        if (typeof pointIndex !== 'number') return false;
        if (type === 'minor') {
            this.moveToNextVertex(-1);
            return false;
        }

        const point = this.getHoverPoint();

        const state = {
            pointIndex,
            point,
            status: this.status,
        };

        this.undoredo(
            why,
            () => {
                this.data.splice(state.pointIndex, 1);
                this.setHoverInfo('major', state.pointIndex);
            },
            () => {
                state.status = this.status;
                this.data.splice(state.pointIndex, 0, state.point);
                this.setHoverInfo('major', state.pointIndex);
                this.status = state.status;
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

function documentStateMachine(stateMachine) {
    const { contexts, actions } = stateMachine;
    const result = [];
    result.push('## Commands');
    [...contexts]
        .toSorted((a, b) => {
            // sort by the about property
            return a.about.localeCompare(b.about);
        })
        .forEach((context) => {
            const { from, when, goto, about } = context;
            if (when) {
                result.push(`- <b>${about}</b>`);
                const whenKeys = when
                    .map((v) => {
                        const keys = v.split('+').map((v) => {
                            switch (v) {
                                case ' ':
                                    return 'Space';
                                default:
                                    return v;
                            }
                        });
                        return keys.join(' ');
                    })
                    .map((v) => `<kbd>${v}</kbd>`)
                    .join(' or ');
                result.push(`when ${whenKeys}`);
            }
        });
    result.push('');
    result.push('## Actions');
    Object.keys(actions)
        .toSorted()
        .forEach((action) => {
            result.push(`- ${action}`);
        });
    verbose(result.join('\n'));
}

new Tests().tests();
