import {
  PlayerAction,
  MonsterActionType,
} from '../../common/objects/enum';

import type { IVector2Like } from '../../libs/babylon/exports';

import type { ISystemFactory } from '../world';

import { MUAttributeSystem } from '../../libs/attributeSystem';

import { PlayerObject } from '../../common/playerObject';

export const AnimationSystem: ISystemFactory = world => {
  const playersQuery = world.with(
    'playerAnimation',
    'modelObject',
    'attributeSystem',
    'movement'
  );

  const playerAnimatableQuery =
    world.with(
      'modelObject',
      'playerAnimation'
    );

  const monsterAnimatableQuery =
    world.with(
      'modelObject',
      'monsterAnimation',
      'movement',
      'monsterAI'
    );

  function calculateAnimation(
    attributeSystem: MUAttributeSystem,
    velocity: IVector2Like,
    running: boolean
  ) {
    const inSafeZone =
      attributeSystem.isAboveZero(
        'inSafeZone'
      );

    const isFemale =
      attributeSystem.isAboveZero(
        'isFemale'
      );

    const isFlying =
      attributeSystem.isAboveZero(
        'isFlying'
      );

    const isSwimming =
      attributeSystem.isAboveZero(
        'isSwimming'
      );

    const isSpearEquipped =
      attributeSystem.isAboveZero(
        'isSpearEquipped'
      );

    const isMoving =
      velocity.x !== 0 ||
      velocity.y !== 0;

    /*
     * ========================================================
     * PLAYER STOP
     * ========================================================
     */

    if (!isMoving) {
      if (isFlying) {
        return PlayerAction.PLAYER_STOP_FLY;
      }

      if (isSpearEquipped) {
        return PlayerAction.PLAYER_STOP_SPEAR;
      }

      if (isSwimming) {
        return isFemale
          ? PlayerAction.PLAYER_STOP_FEMALE
          : PlayerAction.PLAYER_STOP_MALE;
      }

      return isFemale
        ? PlayerAction.PLAYER_STOP_FEMALE
        : PlayerAction.PLAYER_STOP_MALE;
    }

    /*
     * ========================================================
     * PLAYER MOVEMENT
     * ========================================================
     */

    if (isFlying) {
      return PlayerAction.PLAYER_FLY;
    }

    if (isSwimming) {
      return running
        ? PlayerAction.PLAYER_RUN_SWIM
        : PlayerAction.PLAYER_WALK_SWIM;
    }

    if (inSafeZone) {
      if (running) {
        return PlayerAction.PLAYER_RUN;
      }

      return isFemale
        ? PlayerAction.PLAYER_WALK_FEMALE
        : PlayerAction.PLAYER_WALK_MALE;
    }

    if (isSpearEquipped) {
      return running
        ? PlayerAction.PLAYER_RUN_SPEAR
        : PlayerAction.PLAYER_WALK_SPEAR;
    }

    if (isFemale) {
      return running
        ? PlayerAction.PLAYER_RUN
        : PlayerAction.PLAYER_WALK_FEMALE;
    }

    return running
      ? PlayerAction.PLAYER_RUN
      : PlayerAction.PLAYER_WALK_MALE;
  }

  const lastPlayerActions =
    new WeakMap<
      object,
      PlayerAction
    >();

  const lastMonsterActions =
    new WeakMap<
      object,
      MonsterActionType
    >();

  return {
    update: () => {
      const now =
        world.gameTime.TotalGameTime.TotalSeconds;

      /*
       * ========================================================
       * PLAYER ANIMATION STATE
       * ========================================================
       */

      for (const entity of playersQuery) {
        const {
          playerAnimation,
          movement,
          attributeSystem,
        } = entity;

        const combat =
          entity.playerCombat;

        const isMoving =
          movement.velocity.x !== 0 ||
          movement.velocity.y !== 0;

        /*
         * ======================================================
         * MOVEMENT CANCELS ATTACK
         *
         * This is intentional.
         *
         * If the player starts moving:
         *
         * Attack -> cancelled
         * Run/Walk -> immediately restored
         * ======================================================
         */

        if (
          combat?.attacking &&
          isMoving
        ) {
          combat.attacking = false;

          combat.attackUntil = 0;

          combat.damageAt = 0;

          combat.damageApplied = false;
        }

        /*
         * ======================================================
         * ATTACK ANIMATION
         * ======================================================
         */

        if (
          combat?.attacking &&
          now < combat.attackUntil
        ) {
          playerAnimation.action =
            PlayerAction.PLAYER_ATTACK_FIST;

          continue;
        }

        /*
         * Attack finished.
         */
        if (
          combat?.attacking
        ) {
          combat.attacking = false;

          combat.damageApplied = false;
        }

        /*
         * ======================================================
         * NORMAL MOVEMENT ANIMATION
         * ======================================================
         */

        playerAnimation.action =
          calculateAnimation(
            attributeSystem,
            movement.velocity,
            movement.running === true
          );
      }

      /*
       * ========================================================
       * PLAY PLAYER ANIMATIONS
       * ========================================================
       */

      for (const {
        playerAnimation,
        modelObject,
      } of playerAnimatableQuery) {
        const playerObject =
          modelObject as PlayerObject;

        if (!playerObject.Ready) {
          continue;
        }

        const isAttack =
          playerAnimation.action ===
          PlayerAction.PLAYER_ATTACK_FIST;

        /*
         * Normal player animation speed.
         */
        if (
          playerAnimation.action >=
            PlayerAction.PLAYER_WALK_MALE &&
          playerAnimation.action <=
            PlayerAction.PLAYER_RUN_SWIM
        ) {
          playerObject.AnimationSpeed = 6;
        }

        const previousPlayerAction =
          lastPlayerActions.get(
            playerObject
          );

        /*
         * Movement animations loop.
         * Attack is a one-shot and must not remain the
         * active looping animation.
         */
        if (
          previousPlayerAction !==
          playerAnimation.action
        ) {
          playerObject.playAction(
            playerAnimation.action,
            !isAttack
          );

          lastPlayerActions.set(
            playerObject,
            playerAnimation.action
          );
        }

        /*
         * Wings animation.
         */
        if (playerObject.Wings) {
          playerObject.Wings.AnimationSpeed =
            playerObject.CurrentAction < 15
              ? 4
              : 16;
        }
      }

      /*
       * ========================================================
       * MONSTER ANIMATION
       * ========================================================
       */

      for (const {
        monsterAnimation,
        movement,
        modelObject,
        monsterAI,
      } of monsterAnimatableQuery) {
        if (!modelObject.Ready) {
          continue;
        }

        /*
         * Do not overwrite Attack1 while
         * the monster is actually attacking.
         */
        if (
          monsterAI.state !==
          'attack'
        ) {
          const isMoving =
            movement.velocity.x !== 0 ||
            movement.velocity.y !== 0;

          if (isMoving) {
            monsterAnimation.action =
              MonsterActionType.Walk;
          } else {
            monsterAnimation.action =
              MonsterActionType.Stop1;
          }
        }

        const isAttack =
          monsterAnimation.action ===
          MonsterActionType.Attack1;

        const previousMonsterAction =
          lastMonsterActions.get(
            modelObject
          );

        /*
         * Change animation only when
         * the requested action changes.
         */
        if (
          previousMonsterAction !==
          monsterAnimation.action
        ) {
          modelObject.playAction(
            monsterAnimation.action,
            !isAttack
          );

          lastMonsterActions.set(
            modelObject,
            monsterAnimation.action
          );
        }
      }
    },
  };
};