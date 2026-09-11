import { TWFlags } from '../../common/terrain/consts';
import { isFlagInBinaryMask } from '../../common/utils';
import { Store } from '../../store';

import {
  ArcRotateCamera,
  Vector3,
} from '../../libs/babylon/exports';

import type { ISystemFactory } from '../world';

// ============================================================
// MOVEMENT SPEED
// ============================================================

// Town running speed.
const TOWN_RUN_SPEED = 6;

// Outside-town running speed.
const OUTSIDE_RUN_SPEED = 10;

// Camera-relative movement uses this to keep movement horizontal.
const UP = Vector3.Up();

export const KeyboardMovementSystem: ISystemFactory = world => {
  return {
    update: (deltaTime: number) => {
      // ========================================================
      // GET PLAYER
      // ========================================================

      const player = world.playerEntity;

      if (!player) {
        return;
      }

      // ========================================================
      // GET KEYBOARD
      // ========================================================

      const keyboard = world.keyboardInput;

      if (!keyboard) {
        return;
      }

      // ========================================================
      // GET CAMERA
      // ========================================================

      const camera =
        world.scene.activeCamera as ArcRotateCamera;

      if (!camera) {
        return;
      }

      // ========================================================
      // WASD INPUT
      // ========================================================

      const forwardPressed =
        keyboard.pressedKeys.has('KeyW');

      const backwardPressed =
        keyboard.pressedKeys.has('KeyS');

      const leftPressed =
        keyboard.pressedKeys.has('KeyA');

      const rightPressed =
        keyboard.pressedKeys.has('KeyD');

      const moving =
        forwardPressed ||
        backwardPressed ||
        leftPressed ||
        rightPressed;

      // ========================================================
      // NO KEYBOARD MOVEMENT
      // ========================================================

      if (!moving) {
        /*
         * IMPORTANT:
         *
         * Do not clear velocity here.
         *
         * MoveAlongPathSystem may still be controlling the
         * player through click-to-move.
         */
        if (
          player.movement &&
          'running' in player.movement
        ) {
          player.movement.running = false;
        }

        return;
      }

      // ========================================================
      // CAMERA FORWARD
      // ========================================================

      const forward =
        camera
          .getForwardRay()
          .direction
          .clone();

      // Movement must stay on the ground.
      forward.y = 0;

      if (forward.lengthSquared() > 0) {
        forward.normalize();
      }

      // ========================================================
      // CAMERA RIGHT
      // ========================================================

      const right =
        Vector3.Cross(
          UP,
          forward
        );

      if (right.lengthSquared() > 0) {
        right.normalize();
      }

      // ========================================================
      // MOVEMENT INPUT
      // ========================================================

      let forwardAmount = 0;
      let rightAmount = 0;

      if (forwardPressed) {
        forwardAmount += 1;
      }

      if (backwardPressed) {
        forwardAmount -= 1;
      }

      if (rightPressed) {
        rightAmount += 1;
      }

      if (leftPressed) {
        rightAmount -= 1;
      }

      // ========================================================
      // CREATE MOVEMENT VECTOR
      // ========================================================

      const movement =
        forward
          .scale(forwardAmount)
          .add(
            right.scale(rightAmount)
          );

      // ========================================================
      // NORMALIZE MOVEMENT
      // ========================================================

      /*
       * Prevent diagonal movement from being faster.
       */
      if (movement.lengthSquared() === 0) {
        return;
      }

      movement.normalize();

      // ========================================================
      // TOWN / OUTSIDE SPEED
      // ========================================================

      /*
       * The player always runs when using WASD.
       *
       * Town:
       *   speed = 6
       *
       * Outside town:
       *   speed = 7
       *
       * The inSafeZone value is updated below after the player
       * moves across the terrain.
       */
      const inSafeZone =
        player.attributeSystem?.isAboveZero('inSafeZone') ?? false;

      const speed =
        inSafeZone
          ? TOWN_RUN_SPEED
          : OUTSIDE_RUN_SPEED;

      // ========================================================
      // FRAME-RATE INDEPENDENT MOVEMENT
      // ========================================================

      const dt =
        Math.max(
          0,
          deltaTime
        );

      const distance =
        speed * dt;

      // ========================================================
      // CANCEL CLICK-TO-MOVE
      // ========================================================

      /*
       * WASD takes control of the player.
       *
       * Stop the old mouse path from fighting keyboard
       * movement.
       */
      if (player.pathfinding) {
        player.pathfinding.path = null;
        player.pathfinding.calculated = true;
      }

      if (player.playerMoveTo) {
        player.playerMoveTo.handled = true;
        player.playerMoveTo.sendToServer = false;
      }

      // ========================================================
      // MOVE ECS PLAYER
      // ========================================================

      player.transform.pos.x +=
        movement.x * distance;

      player.transform.pos.z +=
        movement.z * distance;

      // ========================================================
      // UPDATE TERRAIN / SAFE-ZONE STATE
      // ========================================================

      /*
       * IMPORTANT:
       *
       * Mouse movement goes through MoveAlongPathSystem,
       * which updates the player's terrain flag and
       * "inSafeZone" attribute.
       *
       * WASD moves the player directly, so we must perform
       * the same update here.
       *
       * This allows the animation system to know whether
       * the player is inside or outside town.
       */
      if (
        world.terrain &&
        player.attributeSystem
      ) {
        // ------------------------------------------------------
        // Update ground height
        // ------------------------------------------------------

        const playerX =
          ~~player.transform.pos.x;

        const playerZ =
          ~~player.transform.pos.z;

        const h1 =
          world.getTerrainHeight(
            playerX,
            playerZ
          );

        const h2 =
          world.getTerrainHeight(
            playerX,
            playerZ
          );

        const h3 =
          world.getTerrainHeight(
            playerX + 1,
            playerZ
          );

        const h4 =
          world.getTerrainHeight(
            playerX + 1,
            playerZ + 1
          );

        const h =
          (
            (
              (h1 + h2) * 0.5
            ) +
            (
              (h3 + h4) * 0.5
            )
          ) * 0.5;

        player.transform.pos.y =
          h;

        // ------------------------------------------------------
        // Update terrain flag
        // ------------------------------------------------------

        const flag =
          world.getTerrainFlag(
            playerX,
            playerZ
          );

        // ------------------------------------------------------
        // Update safe-zone state
        // ------------------------------------------------------

        player.attributeSystem.setValue(
          'inSafeZone',
          isFlagInBinaryMask(
            flag,
            TWFlags.SafeZone
          )
            ? 1
            : 0
        );

        // ------------------------------------------------------
        // Keep player data synchronized
        // ------------------------------------------------------

        Store.playerData.setPosition(
          playerX,
          playerZ
        );

        Store.playerData.setTileFlag(
          flag
        );
      }

      // ========================================================
      // UPDATE SHARED MOVEMENT STATE
      // ========================================================

      if (player.movement) {
        /*
         * AnimationSystem uses movement.velocity to determine
         * whether the character is moving.
         */
        player.movement.velocity.x =
          movement.x * speed;

        player.movement.velocity.y =
          movement.z * speed;

        /*
         * WASD always uses the RUN animation.
         */
        if ('running' in player.movement) {
          player.movement.running = true;
        }
      }

      // ========================================================
      // CHARACTER ROTATION
      // ========================================================

      player.transform.rot.y =
        Math.atan2(
          movement.z,
          movement.x
        ) + Math.PI / 2;
    },
  };
};