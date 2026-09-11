import type { IVector2Like } from '../../libs/babylon/exports';
import {
  MonsterActionType,
  PlayerAction,
} from '../../common/objects/enum';
import type { MUAttributeSystem } from '../../libs/attributeSystem';
import type { ISystemFactory } from '../world';
import type { PlayerObject } from '../../common/playerObject';

export const AnimationSystem: ISystemFactory = world => {
  const playersQuery = world.with(
    'playerAnimation',
    'modelObject',
    'attributeSystem',
    'movement'
  );

  const playerAnimatableQuery = world.with(
    'modelObject',
    'playerAnimation'
  );

  const monsterAnimatableQuery = world.with(
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
    const inSafeZone = attributeSystem.isAboveZero('inSafeZone');
    const isFemale = attributeSystem.isAboveZero('isFemale');
    const isFlying = attributeSystem.isAboveZero('isFlying');
    const isSwimming = attributeSystem.isAboveZero('isSwimming');
    const isSpearEquipped =
      attributeSystem.isAboveZero('isSpearEquipped');

    const isMoving = velocity.x !== 0 || velocity.y !== 0;

    if (!isMoving) {
      if (isFlying) return PlayerAction.PLAYER_STOP_FLY;
      if (isSpearEquipped) return PlayerAction.PLAYER_STOP_SPEAR;

      if (isSwimming) {
        return isFemale
          ? PlayerAction.PLAYER_STOP_FEMALE
          : PlayerAction.PLAYER_STOP_MALE;
      }

      return isFemale
        ? PlayerAction.PLAYER_STOP_FEMALE
        : PlayerAction.PLAYER_STOP_MALE;
    }

    if (isFlying) return PlayerAction.PLAYER_FLY;

    if (isSwimming) {
      return running
        ? PlayerAction.PLAYER_RUN_SWIM
        : PlayerAction.PLAYER_WALK_SWIM;
    }

    if (inSafeZone) {
      if (running) return PlayerAction.PLAYER_RUN;

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

  function isPlayerAttackAction(action: PlayerAction) {
    return (
      action === PlayerAction.PLAYER_ATTACK_FIST ||
      action === PlayerAction.PLAYER_ATTACK_SWORD_RIGHT1 ||
      action === PlayerAction.PLAYER_ATTACK_SWORD_RIGHT2 ||
      action === PlayerAction.PLAYER_ATTACK_SWORD_LEFT1 ||
      action === PlayerAction.PLAYER_ATTACK_SWORD_LEFT2
    );
  }

  const lastPlayerActions = new WeakMap<object, PlayerAction>();
  const lastMonsterActions = new WeakMap<object, MonsterActionType>();

  return {
    update: () => {
      // ----------------------------------------------------------
      // PLAYER LOGICAL ANIMATION
      // ----------------------------------------------------------
      for (const entity of playersQuery) {
        const {
          playerAnimation,
          movement,
          attributeSystem,
        } = entity;

        // Combat owns the attack animation only while an attack is
        // actually running. Once the swing is finished, immediately
        // return control to movement animation. This prevents the
        // character from staying in the last attack pose (statue)
        // when the player starts running again.
        const combatIsAttacking =
          entity.playerCombat?.attacking === true;

        if (!combatIsAttacking) {
          playerAnimation.action = calculateAnimation(
            attributeSystem,
            movement.velocity,
            movement.running === true
          );
        }
      }

      // ----------------------------------------------------------
      // PLAYER MODEL ANIMATION
      // ----------------------------------------------------------
      for (const { playerAnimation, modelObject } of playerAnimatableQuery) {
        const playerObject = modelObject as PlayerObject;

        if (!playerObject.Ready) continue;

        const action = playerAnimation.action;
        const isAttack = isPlayerAttackAction(action);

        // MU attack animations are one-shot and should play at their
        // authored timing. Movement is intentionally slower.
        playerObject.AnimationSpeed = isAttack ? 14 : 6;

        const previous = lastPlayerActions.get(playerObject);

        if (previous !== action) {
          playerObject.playAction(action, !isAttack);
          lastPlayerActions.set(playerObject, action);
        }

        if (playerObject.Wings) {
          playerObject.Wings.AnimationSpeed =
            playerObject.CurrentAction < 15 ? 4 : 16;
        }
      }

      // ----------------------------------------------------------
      // MONSTER MODEL ANIMATION
      // ----------------------------------------------------------
      for (const {
        monsterAnimation,
        movement,
        modelObject,
        monsterAI,
      } of monsterAnimatableQuery) {
        if (!modelObject.Ready) continue;

        const isMoving =
          movement.velocity.x !== 0 ||
          movement.velocity.y !== 0;

        if (
          monsterAI.state !== 'attack' &&
          monsterAI.state !== 'dead' &&
          isMoving
        ) {
          monsterAnimation.action = MonsterActionType.Walk;
        } else if (
          monsterAI.state !== 'attack' &&
          monsterAI.state !== 'dead'
        ) {
          monsterAnimation.action = MonsterActionType.Stop1;
        }

        const isAttack =
          monsterAnimation.action === MonsterActionType.Attack1;

        const isDeath =
          monsterAnimation.action === MonsterActionType.Die;

        if (isAttack) {
          modelObject.AnimationSpeed = 14;
        }

        const previous = lastMonsterActions.get(modelObject);

        if (previous !== monsterAnimation.action) {
          modelObject.playAction(
            monsterAnimation.action,
            !isAttack && !isDeath
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
