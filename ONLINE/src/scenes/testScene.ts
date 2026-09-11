import { ArcRotateCamera, HighlightLayer } from '../libs/babylon/exports';
import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from '../libs/babylon/exports';

import { addInspectorForScene } from '../libs/babylon/utils';

export class TestScene extends Scene {
  defaultCamera: ArcRotateCamera;

  readonly hl: HighlightLayer;

  constructor(engine: Engine) {
    super(engine);

    // ============================================================
    // CAMERA
    // ============================================================

    const camera = new ArcRotateCamera(
      'ArcRotateCamera',
      -Math.PI / 4,
      Math.PI / 4.5,
      10,
      new Vector3(0, 0, 0),
      this
    );

    camera.minZ = 0.1;
    camera.maxZ = 5000;

    camera.position.set(135, 10, 130);

    // Zoom limits
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 35;

   // ============================================================
// CAMERA CONTROLS
// ============================================================

const canvas = engine.getRenderingCanvas();

if (canvas) {
  // We intentionally DO NOT call camera.attachControl().
  //
  // We handle:
  //   Right mouse + drag = rotation
  //   Mouse wheel        = zoom
  //
  // This prevents Babylon's default left-click camera rotation.

  let rotatingCamera = false;

  let previousX = 0;
  let previousY = 0;

  // ----------------------------------------------------------
  // Disable browser right-click menu
  // ----------------------------------------------------------

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // ----------------------------------------------------------
  // RIGHT MOUSE BUTTON DOWN
  // ----------------------------------------------------------

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) {
      return;
    }

    rotatingCamera = true;

    previousX = event.clientX;
    previousY = event.clientY;

    // Capture pointer so rotation continues while dragging.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture isn't available.
    }

    event.preventDefault();
  });

  // ----------------------------------------------------------
  // RIGHT MOUSE BUTTON UP
  // ----------------------------------------------------------

  canvas.addEventListener('pointerup', (event) => {
    if (event.button !== 2) {
      return;
    }

    rotatingCamera = false;

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture isn't available.
    }

    event.preventDefault();
  });

  // ----------------------------------------------------------
  // RIGHT MOUSE DRAG
  // ----------------------------------------------------------

  canvas.addEventListener('pointermove', (event) => {
    if (!rotatingCamera) {
      return;
    }

    const deltaX =
      event.clientX - previousX;

    const deltaY =
      event.clientY - previousY;

    previousX = event.clientX;
    previousY = event.clientY;

    // Camera sensitivity
    const sensitivity = 0.005;

    // Horizontal rotation
    camera.alpha -=
      deltaX * sensitivity;

    // Vertical rotation
    camera.beta -=
      deltaY * sensitivity;

    // Prevent camera from flipping upside down.
    const minBeta = 0.15;
    const maxBeta = Math.PI - 0.15;

    camera.beta = Math.max(
      minBeta,
      Math.min(
        maxBeta,
        camera.beta
      )
    );

    event.preventDefault();
  });

  // ----------------------------------------------------------
  // MOUSE WHEEL ZOOM
  // ----------------------------------------------------------

  canvas.addEventListener(
    'wheel',
    (event) => {
      const zoomSpeed = 0.05;

      camera.radius +=
        event.deltaY * zoomSpeed;

      // Respect your existing zoom limits.
      camera.radius = Math.max(
        camera.lowerRadiusLimit ?? 3,
        Math.min(
          camera.upperRadiusLimit ?? 35,
          camera.radius
        )
      );

      event.preventDefault();
    },
    {
      passive: false,
    }
  );

  // ----------------------------------------------------------
  // KEYBOARD FOCUS
  // ----------------------------------------------------------

  canvas.tabIndex = 1;
  canvas.focus();
}


    this.defaultCamera = camera;

    // ============================================================
    // SCENE SETTINGS
    // ============================================================

    this.fogEnabled = false;

    this.fogStart = 1;
    this.fogEnd = 25;

    this.skipFrustumClipping = true;

    this.autoClearDepthAndStencil = true;
    this.autoClear = true;

    this.clearColor = new Color4(
      0,
      0,
      0,
      1
    );

    this.ambientColor = new Color3(
      1,
      1,
      1
    );

    // ============================================================
    // HIGHLIGHT LAYER
    // ============================================================

    this.hl = new HighlightLayer(
      'hl1',
      this,
      {
        isStroke: true,
        alphaBlendingMode: 1,
      }
    );

    this.hl.innerGlow = false;

    // ============================================================
    // INSPECTOR
    // ============================================================

    addInspectorForScene(this);

    // ============================================================
    // DIRECTIONAL LIGHT
    // ============================================================

    const light2 = new DirectionalLight(
      'DirectionalLight2',
      new Vector3(0, 1, -2),
      this
    );

    light2.intensity = 3;

    // ============================================================
    // HEMISPHERIC LIGHT
    // ============================================================

    const light3 = new HemisphericLight(
      'light',
      new Vector3(0, 1, 0),
      this
    );

    light3.intensity = 1;

    // ============================================================
    // IMPORTANT
    // ============================================================
    //
    // WASD is handled by the ECS systems.
    //
    // TestScene should NOT directly move the player.
    //
    // KeyboardInputSystem
    //        ↓
    // Player movement system
    //        ↓
    // world.playerEntity
    //        ↓
    // RenderSystem
    //
    // ============================================================

    console.log(
      '[TestScene] Scene initialized.'
    );

    console.log(
      '[TestScene] Camera: RIGHT CLICK + DRAG to rotate.'
    );

    console.log(
      '[TestScene] Camera: LEFT CLICK does not rotate.'
    );
  }
}
