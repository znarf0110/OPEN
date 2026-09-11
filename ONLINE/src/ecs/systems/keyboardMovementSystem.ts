import { TWFlags } from '../../common/terrain/consts';
import { isFlagInBinaryMask } from '../../common/utils';
import { Store } from '../../store';
import { ArcRotateCamera, Vector3 } from '../../libs/babylon/exports';
import type { ISystemFactory } from '../world';

const TOWN_RUN_SPEED = 6;
const OUTSIDE_RUN_SPEED = 10;
const UP = Vector3.Up();

export const KeyboardMovementSystem: ISystemFactory = world => ({
  update: (deltaTime: number) => {
    const player = world.playerEntity;
    if (!player) return;
    const keyboard = world.keyboardInput;
    if (!keyboard) return;
    const camera = world.scene.activeCamera as ArcRotateCamera;
    if (!camera) return;

    const forwardPressed = keyboard.pressedKeys.has('KeyW');
    const backwardPressed = keyboard.pressedKeys.has('KeyS');
    const leftPressed = keyboard.pressedKeys.has('KeyA');
    const rightPressed = keyboard.pressedKeys.has('KeyD');
    const moving = forwardPressed || backwardPressed || leftPressed || rightPressed;

    if (!moving) {
      if (player.movement) player.movement.running = false;
      return;
    }

    // Keyboard movement is a hard cancel of auto-combat. This prevents
    // MoveAlongPathSystem from taking control back after the player leaves town.
    if (player.playerCombat?.target) {
      const target = player.playerCombat.target;
      if (target.monsterAI?.target === player) {
        target.monsterAI.target = null;
        target.monsterAI.lured = false;
        target.monsterAI.state = 'return';
        target.monsterAI.nextDecisionAt = world.gameTime.TotalGameTime.TotalSeconds ?? world.gameTime.TotalGameTime.TotalSeconds;
      }
      player.playerCombat.attacking = false;
      player.playerCombat.target = null;
      player.playerCombat.attackUntil = 0;
      player.playerCombat.damageAt = 0;
      player.playerCombat.damageApplied = false;
    }

    const forward = camera.getForwardRay().direction.clone();
    forward.y = 0;
    if (forward.lengthSquared() > 0) forward.normalize();
    const right = Vector3.Cross(UP, forward);
    if (right.lengthSquared() > 0) right.normalize();

    let forwardAmount = 0;
    let rightAmount = 0;
    if (forwardPressed) forwardAmount += 1;
    if (backwardPressed) forwardAmount -= 1;
    if (rightPressed) rightAmount += 1;
    if (leftPressed) rightAmount -= 1;

    const movement = forward.scale(forwardAmount).add(right.scale(rightAmount));
    if (movement.lengthSquared() === 0) return;
    movement.normalize();

    const inSafeZone = player.attributeSystem?.isAboveZero('inSafeZone') ?? false;
    const speed = inSafeZone ? TOWN_RUN_SPEED : OUTSIDE_RUN_SPEED;
    const dt = Math.max(0, deltaTime);
    const distance = speed * dt;

    if (player.pathfinding) {
      player.pathfinding.path = null;
      player.pathfinding.calculated = true;
    }
    if (player.playerMoveTo) {
      player.playerMoveTo.handled = true;
      player.playerMoveTo.sendToServer = false;
    }

    player.transform.pos.x += movement.x * distance;
    player.transform.pos.z += movement.z * distance;

    if (world.terrain && player.attributeSystem) {
      const playerX = ~~player.transform.pos.x;
      const playerZ = ~~player.transform.pos.z;
      const h1 = world.getTerrainHeight(playerX, playerZ);
      const h3 = world.getTerrainHeight(playerX + 1, playerZ);
      const h4 = world.getTerrainHeight(playerX + 1, playerZ + 1);
      player.transform.pos.y = ((h1 + h1) * 0.5 + (h3 + h4) * 0.5) * 0.5;
      const flag = world.getTerrainFlag(playerX, playerZ);
      player.attributeSystem.setValue('inSafeZone', isFlagInBinaryMask(flag, TWFlags.SafeZone) ? 1 : 0);
      Store.playerData.setPosition(playerX, playerZ);
      Store.playerData.setTileFlag(flag);
    }

    if (player.movement) {
      player.movement.velocity.x = movement.x * speed;
      player.movement.velocity.y = movement.z * speed;
      player.movement.running = true;
    }

    player.transform.rot.y = Math.atan2(movement.z, movement.x) + Math.PI / 2;
  },
});
