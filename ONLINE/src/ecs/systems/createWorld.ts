import { RenderSystem } from './systems/renderSystem';
import { World, type ISystemFactory } from './world';
import { PathfindingSystem } from './systems/pathfindingSystem';
import { PlayerControllerSystem } from './systems/playerControllerSystem';
import { MoveAlongPathSystem } from './systems/moveAlongPathSystem';
import { AnimationSystem } from './systems/animationSystem';
import { ModelLoaderSystem } from './systems/modelLoaderSystem';
import { CameraFollowSystem } from './systems/cameraFollowSystem';
import { NetworkSystem } from './systems/networkSystem';
import { OutOfScopeSystem } from './systems/outOfScopeSystem';
import { CalculateVisibilitySystem } from './systems/calculateVisibilitySystem';
import { CalculateScreenPositionSystem } from './systems/calculateScreenPositionSystem';
import { AppearanceSystem } from './systems/appearanceSystem';
import { DrawDebugSystem } from './systems/drawDebugSystem';
import { HighlightSystem } from './systems/highlightSystem';
import type { TestScene } from '../scenes/testScene';
import { PointerInputSystem } from './systems/pointerInputSystem';
import { KeyboardInputSystem } from './systems/keyboardInputSystem';
import { BackgroundMusicSystem } from './systems/backgroundMusicSystem';
import { InteractiveAreaSystem } from './systems/interactiveAreaSystem';
import { WalkSfxSystem } from './systems/walkSfxSystem';
import { KeyboardMovementSystem } from './systems/keyboardMovementSystem';
import { TestMonsterSystem } from './systems/testMonsterSystem';

const factories: ISystemFactory[] = [
  ModelLoaderSystem,

  PointerInputSystem,
  KeyboardInputSystem,
  InteractiveAreaSystem,

  PlayerControllerSystem,
  PathfindingSystem,

  CalculateVisibilitySystem,
  CalculateScreenPositionSystem,

  NetworkSystem,

  // Click-to-move movement.
  MoveAlongPathSystem,

  // WASD movement.
  // WASD overrides click-to-move when a key is pressed.
  KeyboardMovementSystem,

  HighlightSystem,
  AnimationSystem,
  AppearanceSystem,
  WalkSfxSystem,

  CameraFollowSystem,
  OutOfScopeSystem,
  BackgroundMusicSystem,
  DrawDebugSystem,

  /*
   * ==========================================================
   * TEST MONSTER
   * ==========================================================
   *
   * This runs after the player has had a chance to exist.
   *
   * On the first frame where world.playerEntity exists,
   * TestMonsterSystem creates ONE Budge Dragon.
   */
  TestMonsterSystem,

  RenderSystem,
];

export function createWorld(scene: TestScene) {
  const world = new World(scene);

  const systems = factories.map(f => f(world));

  return {
    world,

    updateSystems: (dt: number) => {
      systems.forEach(system => {
        system.update?.(dt);
      });
    },
  } as const;
}