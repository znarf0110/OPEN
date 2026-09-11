import { CreateBox, PointerEventTypes, StandardMaterial } from '../../libs/babylon/exports';
import type { ISystemFactory } from '../world';

const MOVE_DELAY = 0.25;

export const PlayerControllerSystem: ISystemFactory = world => {
  const query = world.with('playerMoveTo', 'transform', 'pathfinding');

  const box = CreateBox('playerControllerBox', { width: 0.75, depth: 0.75, height: 0.02 }, world.scene);
  box.setParent(world.mapParent);
  box.isPickable = false;
  box.alwaysSelectAsActiveMesh = true;
  box.material = new StandardMaterial('playerControllerBoxMaterial', world.scene);
  box.material.alpha = 0.25;

  let lastClientX = 0;
  let lastClientY = 0;
  let delay = MOVE_DELAY;

  function clearPlayerCombat() {
    const player = world.playerEntity;
    if (!player?.playerCombat) return;

    const target = player.playerCombat.target;
    if (target?.monsterAI?.target === player) {
      target.monsterAI.target = null;
      target.monsterAI.lured = false;
      target.monsterAI.state = 'return';
      target.monsterAI.nextDecisionAt = world.gameTime.TotalGameTime.TotalSeconds;
      target.monsterAI.attackUntil = 0;
      target.monsterAI.damageAt = 0;
      target.monsterAI.damageApplied = false;
    }

    player.playerCombat.attacking = false;
    player.playerCombat.target = null;
    player.playerCombat.attackUntil = 0;
    player.playerCombat.damageAt = 0;
    player.playerCombat.damageApplied = false;
  }

  world.scene.onPointerObservable.add(ev => {
    if (ev.type === PointerEventTypes.POINTERMOVE) {
      lastClientX = ev.event.clientX;
      lastClientY = ev.event.clientY;
      return;
    }

    if (ev.type === PointerEventTypes.POINTERDOWN) {
      const player = world.playerEntity;
      const target = world.currentPointerTarget;

      if (player && target && target !== player && target.monsterAI && target.monsterHealth && target.transform && target.monsterHealth.current > 0) {
        player.playerCombat ??= { attacking: false, target: null, attackUntil: 0, damageAt: 0, damageApplied: false, attackRange: 2.2 };
        player.playerCombat.target = target;
        player.playerCombat.attacking = false;
        player.playerCombat.attackUntil = 0;
        player.playerCombat.damageAt = 0;
        player.playerCombat.damageApplied = false;
        target.monsterAI.target = player;
        target.monsterAI.lured = true;
        target.monsterAI.state = 'lured';
        target.monsterAI.chaseStartedAt = world.gameTime.TotalGameTime.TotalSeconds;
        world.pointerPressed = false;
        return;
      }

      clearPlayerCombat();
      world.pointerPressed = true;
    }

    if (ev.type === PointerEventTypes.POINTERUP) {
      world.pointerPressed = false;
    }
  });

  window.addEventListener('lostpointercapture', () => { world.pointerPressed = false; });

  function tryMove() {
    const player = world.playerEntity;
    if (!player) return;

    const pick = world.scene.pick(lastClientX, lastClientY, m => m === world.terrain?.mesh, true);
    if (!pick?.pickedPoint) return;

    const point = pick.pickedPoint;
    const x = ~~point.x;
    const z = ~~point.z;
    if (!world.isWalkable(x, z)) return;

    clearPlayerCombat();
    player.playerMoveTo.point.x = point.x;
    player.playerMoveTo.point.y = point.z;
    player.playerMoveTo.handled = false;
    player.playerMoveTo.sendToServer = true;
  }

  return {
    update: dt => {
      delay -= dt;
      if (world.pointerPressed && delay <= 0) {
        delay = MOVE_DELAY;
        tryMove();
      }

      for (const { playerMoveTo, transform, pathfinding, localPlayer } of query) {
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
          box.position.y = world.getTerrainHeight(playerMoveTo.point.x, playerMoveTo.point.y) + 0.02;
        }
      }
    },
  };
};
