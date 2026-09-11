import { ModelObject } from './modelObject';
import {
  Vector2,
  Vector3,
} from '../libs/babylon/exports';
import { Queue } from './queue';

type Direction = number;

export abstract class WalkerObject extends ModelObject {
  // ------------------------------------------------------------
  // Movement / rotation state
  // ------------------------------------------------------------

  protected _targetAngle: Vector3 = Vector3.Zero();
  protected _direction: Direction = 0;
  protected _location: Vector2 = Vector2.Zero();

  protected _currentPath: Queue<Vector2> | null = null;

  // ------------------------------------------------------------
  // Camera state
  // ------------------------------------------------------------

  protected _previousScrollValue = 0;

  protected _isRotating = false;
  protected _wasRotating = false;

  // ------------------------------------------------------------
  // Animation state
  // ------------------------------------------------------------

  protected static readonly RotationSpeed = 8;

  protected _previousActionForSound = -1;
  protected _serverControlledAnimation = false;

  // ------------------------------------------------------------
  // Miscellaneous
  // ------------------------------------------------------------

  extraHeight = 0;

  moveTargetPosition: Vector3 = Vector3.Zero();
  moveSpeed = 1;

  networkId = 0;
  idanim = 0;

  // ------------------------------------------------------------
  // Properties
  // ------------------------------------------------------------

  get isMainWalker(): boolean {
    /*
     * The current ECS architecture determines the local player
     * through the ECS entity, not through WalkerObject.
     *
     * Keep this as false for compatibility with the old WalkerObject
     * API. The actual local-player checks are handled by ECS systems.
     */
    return false;
  }

  get location(): Vector2 {
    return this._location;
  }

  set location(value: Vector2) {
    this.onLocationChanged(this._location, value);
  }

  get direction(): Direction {
    return this._direction;
  }

  set direction(value: Direction) {
    if (this._direction !== value) {
      this._direction = value;
      this.onDirectionChanged();
    }
  }

  get targetPosition(): Vector3 {
    return new Vector3(
      this.location.x,
      this.location.y,
      0
    );
  }

  get isMoving(): boolean {
    return (
      Vector3.Distance(
        this.moveTargetPosition,
        this.targetPosition
      ) > 0
    );
  }

  get isOneShotPlaying(): boolean {
    return false;
  }

  // ------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------

  /*
   * ModelObject owns model loading in the current architecture.
   *
   * The old WalkerObject implementation called:
   *
   *   super.load?.();
   *
   * but ModelObject.load() now requires a GLTF object.
   *
   * WalkerObject therefore does not override load().
   */

  reset(): void {
    this._currentPath = null;
    this.moveTargetPosition = Vector3.Zero();
  }

  // ------------------------------------------------------------
  // Direction
  // ------------------------------------------------------------

  protected onDirectionChanged(): void {
    /*
     * Direction handling is currently performed by the ECS
     * movement systems.
     *
     * Keep this hook for compatibility with the original
     * WalkerObject API.
     */
  }

  // ------------------------------------------------------------
  // Update
  // ------------------------------------------------------------

  update(
    gameTime: ModelObject['WorldIndex']
  ): void {
    /*
     * WalkerObject was originally based on the old GameTime/
     * object-oriented architecture.
     *
     * The current project uses ECS systems for movement and
     * animation, so there is no GameTime object here.
     *
     * Keep this method only as a compatibility hook.
     */
    void gameTime;
  }

  protected animation(
    _gameTime?: unknown
  ): void {
    /*
     * Animation is handled by animationSystem.ts in the
     * current ECS architecture.
     */
  }

  playAction(
    actionIndex: number,
    fromServer = false
  ): void {
    this._serverControlledAnimation = fromServer;

    /*
     * ModelObject.playAction() is the actual Babylon animation
     * implementation used by the current model system.
     */
    super.playAction(actionIndex);
  }

  // ------------------------------------------------------------
  // Movement
  // ------------------------------------------------------------

  moveTo(
    targetLocation: Vector2,
    _sendToServer = true
  ): void {
    /*
     * Pathfinding and movement are handled by ECS systems.
     *
     * Keep the target information here for compatibility with
     * code that still calls WalkerObject.moveTo().
     */
    this.moveTargetPosition.set(
      targetLocation.x,
      targetLocation.y,
      0
    );
  }

  async sendWalkPathToServerAsync(
    path: Vector2[]
  ): Promise<void> {
    if (!path || path.length === 0) {
      return;
    }

    const net = (window as any).MuGame?.Network;

    if (!net) {
      return;
    }

    const startX = Math.floor(this.location.x);
    const startY = Math.floor(this.location.y);

    function getClientDirectionCode(
      from: Vector2,
      to: Vector2
    ): number {
      const dx = Math.round(to.x - from.x);
      const dy = Math.round(to.y - from.y);

      if (dx === -1 && dy === 0) return 0;
      if (dx === -1 && dy === 1) return 1;
      if (dx === 0 && dy === 1) return 2;
      if (dx === 1 && dy === 1) return 3;
      if (dx === 1 && dy === 0) return 4;
      if (dx === 1 && dy === -1) return 5;
      if (dx === 0 && dy === -1) return 6;
      if (dx === -1 && dy === -1) return 7;

      return 0xff;
    }

    const clientDirs: number[] = [];

    let currentPos =
      this.location.clone();

    for (const step of path) {
      const dirCode =
        getClientDirectionCode(
          currentPos,
          step
        );

      if (dirCode > 7) {
        break;
      }

      clientDirs.push(dirCode);
      currentPos = step;

      if (clientDirs.length === 15) {
        break;
      }
    }

    if (clientDirs.length === 0) {
      return;
    }

    const directionMap =
      net.getDirectionMap?.();

    const serverDirs =
      clientDirs.map(
        cd =>
          directionMap &&
          directionMap[cd] !== undefined
            ? directionMap[cd]
            : cd
      );

    await net.sendWalkRequestAsync(
      startX,
      startY,
      serverDirs
    );
  }

  // ------------------------------------------------------------
  // Location
  // ------------------------------------------------------------

  protected onLocationChanged(
    oldLocation: Vector2,
    newLocation: Vector2
  ): void {
    if (
      oldLocation.equalsWithEpsilon(
        newLocation
      )
    ) {
      return;
    }

    this._location.x =
      Math.floor(newLocation.x);

    this._location.y =
      Math.floor(newLocation.y);

    if (
      oldLocation.x === 0 &&
      oldLocation.y === 0
    ) {
      return;
    }

    const deltaX =
      Math.round(
        newLocation.x -
          oldLocation.x
      );

    const deltaY =
      Math.round(
        newLocation.y -
          oldLocation.y
      );

    /*
     * Direction calculation is currently performed by
     * the ECS movement systems.
     */
    void deltaX;
    void deltaY;
  }
}