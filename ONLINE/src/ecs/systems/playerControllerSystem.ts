import {
  CreateBox,
  PointerEventTypes,
  StandardMaterial,
} from '../../libs/babylon/exports';
import { PlayerAction } from '../../common/objects/enum';
import type { ISystemFactory } from '../world';

const MOVE_DELAY = 0.25;

export const PlayerControllerSystem: ISystemFactory = world => {
  const query = world.with(
    'playerMoveTo',
    'transform',
    'pathfinding'
  );

  const size = 0.75;
  const box = CreateBox(
    'playerControllerBox',
    { width: size, depth: size, height: 0.02 },
    world.scene
  );

  box.setParent(world.mapParent);
  box.isPickable = false;
  box.alwaysSelectAsActiveMesh = true;

  box.material = new StandardMaterial(
    'playerControllerBoxMaterial',
    world.scene
  );

  box.material.alpha = 0.25;

  const scene = world.scene;

  let lastClientX = 0;
  let lastClientY = 0;

  // --------------------------------------------------
  // Mouse state
  // --------------------------------------------------

  let attackMonsterHeld = false;
  let attackRequested = false;

  scene.onPointerObservable.add(ev => {
    if (ev.type === PointerEventTypes.POINTERMOVE) {
      lastClientX = ev.event.clientX;
      lastClientY = ev.event.clientY;
    }

    if (ev.type === PointerEventTypes.POINTERDOWN) {
      const target = world.currentPointerTarget;

      // If the mouse is currently over a monster,
      // clicking it should attack instead of moving.
      if (target && 'monsterAnimation' in target) {
        const playerEntity = world.playerEntity;

        attackMonsterHeld = true;
        attackRequested = true;

        if (playerEntity?.playerCombat) {
          playerEntity.playerCombat.target = target;
          playerEntity.playerCombat.attacking = false;
          playerEntity.playerCombat.attackUntil = 0;
          playerEntity.playerCombat.damageAt = 0;
          playerEntity.playerCombat.damageApplied = false;
        }

        if (target.monsterAI) {
          target.monsterAI.target = playerEntity ?? null;
          target.monsterAI.lured = true;
          target.monsterAI.state = 'lured';
          target.monsterAI.chaseStartedAt =
            world.gameTime.TotalGameTime.TotalSeconds;
        }

        console.log('[ATTACK] Monster clicked', target);
      }

      world.pointerPressed = true;
    }

    if (ev.type === PointerEventTypes.POINTERUP) {
      attackMonsterHeld = false;
      world.pointerPressed = false;
    }
  });

  window.addEventListener('lostpointercapture', () => {
    attackMonsterHeld = false;
    world.pointerPressed = false;
  });

  // --------------------------------------------------
  // Movement
  // --------------------------------------------------

  let delay = MOVE_DELAY;

  function tryMove() {
    const playerEntity = world.playerEntity;

    if (!playerEntity) return;

    // Do NOT move while attacking a monster.
    if (attackMonsterHeld) return;

    const pickInfo = scene.pick(
      lastClientX,
      lastClientY,
      m => m === world.terrain?.mesh,
      true
    );

    if (!pickInfo) return;

    const point = pickInfo.pickedPoint;

    if (!point) return;

    if (point.lengthSquared() < 0.01) return;

    const x = ~~point.x;
    const z = ~~point.z;

    if (!world.isWalkable(x, z)) return;

    // A new ground movement command cancels the current attack.
    if (playerEntity.playerCombat) {
      playerEntity.playerCombat.attacking = false;
      playerEntity.playerCombat.target = null;
      playerEntity.playerCombat.attackUntil = 0;
      playerEntity.playerCombat.damageAt = 0;
      playerEntity.playerCombat.damageApplied = false;
    }

    playerEntity.playerMoveTo.point.x = point.x;
    playerEntity.playerMoveTo.point.y = point.z;
    playerEntity.playerMoveTo.handled = false;
    playerEntity.playerMoveTo.sendToServer = true;
  }

  // --------------------------------------------------
  // Update
  // --------------------------------------------------

  return {
    update: dt => {
      const playerEntity = world.playerEntity;

      // ------------------------------------------------
      // ATTACK
      // ------------------------------------------------

      if (attackRequested) {
        attackRequested = false;

        if (playerEntity && playerEntity.playerAnimation) {
          playerEntity.playerAnimation.action =
            PlayerAction.PLAYER_ATTACK_FIST;

          console.log('[ATTACK] PLAYER_ATTACK_FIST');
        }
      }

      // ------------------------------------------------
      // MOVEMENT
      // ------------------------------------------------

      delay -= dt;

      if (world.pointerPressed && !attackMonsterHeld) {
        if (delay <= 0) {
          delay = MOVE_DELAY;
          tryMove();
        }
      }

      // ------------------------------------------------
      // Process player movement
      // ------------------------------------------------

      for (const {
        playerMoveTo,
        transform,
        pathfinding,
        localPlayer,
      } of query) {
        if (playerMoveTo.handled) continue;

        playerMoveTo.handled = true;

        pathfinding.calculated = false;

        pathfinding.from.x = transform.pos.x;
        pathfinding.from.y = transform.pos.z;

        pathfinding.to.x = ~~playerMoveTo.point.x;
        pathfinding.to.y = ~~playerMoveTo.point.y;

        if (localPlayer) {
          box.position.x = ~~playerMoveTo.point.x + 0.5;
          box.position.z = ~~playerMoveTo.point.y + 0.5;

          box.position.y =
            world.getTerrainHeight(
              playerMoveTo.point.x,
              playerMoveTo.point.y
            ) + 0.02;
        }
      }
    },
  };
};