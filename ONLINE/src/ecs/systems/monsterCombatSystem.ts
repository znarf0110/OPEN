import type { Entity, ISystemFactory } from '../world';
import { PlayerAction } from '../../common/objects/enum';

const ATTACK_DURATION = 0.65;
const DAMAGE_TIME = 0.30;
const COOLDOWN = 0.80;

const PLAYER_DAMAGE = 10;
const MONSTER_DAMAGE = 5;

export const MonsterCombatSystem: ISystemFactory = world => {
  const players = world.with(
    'playerCombat',
    'transform',
    'movement',
    'playerAnimation'
  );

  const monsters = world.with(
    'monsterAI',
    'monsterHealth',
    'transform'
  );

  return {
    update: () => {
      const now =
        world.gameTime.TotalGameTime.TotalSeconds;

      /*
       * ========================================================
       * PLAYER COMBAT
       * ========================================================
       */

      for (const player of players) {
        const combat = player.playerCombat;

        if (!combat) {
          continue;
        }

        const target = combat.target;

        /*
         * Target no longer exists or is dead.
         */
        if (
          !target?.transform ||
          !target.monsterHealth ||
          target.monsterHealth.current <= 0
        ) {
          combat.attacking = false;
          combat.target = null;
          combat.attackUntil = 0;
          combat.damageAt = 0;
          combat.damageApplied = false;

          continue;
        }

        const dx =
          target.transform.pos.x -
          player.transform.pos.x;

        const dz =
          target.transform.pos.z -
          player.transform.pos.z;

        const distance =
          Math.sqrt(
            dx * dx +
            dz * dz
          );

        /*
         * ======================================================
         * IMPORTANT:
         *
         * DO NOT STOP PLAYER MOVEMENT HERE.
         *
         * MoveAlongPathSystem controls movement.
         *
         * If the player is outside attack range, simply wait
         * for the player to reach the monster.
         * ======================================================
         */

        if (
          distance >
          combat.attackRange
        ) {
          combat.attacking = false;
          combat.damageApplied = false;

          continue;
        }

        /*
         * Face the monster.
         */
        player.transform.rot.y =
          Math.atan2(
            dz,
            dx
          ) + Math.PI / 2;

        /*
         * ======================================================
         * START ATTACK
         * ======================================================
         */

        if (
          !combat.attacking &&
          now >=
            combat.attackUntil +
              COOLDOWN
        ) {
          combat.attacking = true;

          combat.attackUntil =
            now +
            ATTACK_DURATION;

          combat.damageAt =
            now +
            DAMAGE_TIME;

          combat.damageApplied =
            false;

          player.playerAnimation.action =
            PlayerAction.PLAYER_ATTACK_FIST;
        }

        /*
         * ======================================================
         * APPLY PLAYER DAMAGE
         * ======================================================
         */

        if (
          combat.attacking &&
          !combat.damageApplied &&
          now >= combat.damageAt
        ) {
          combat.damageApplied = true;

          target.monsterHealth.current =
            Math.max(
              0,
              target.monsterHealth.current -
                PLAYER_DAMAGE
            );

          world.addComponent(
            target,
            'damageNumber',
            {
              amount: PLAYER_DAMAGE,
              time: now,
            } as any
          );

          /*
           * Monster died from this hit.
           */
          if (
            target.monsterHealth.current <= 0
          ) {
            combat.attacking = false;

            combat.target = null;

            combat.attackUntil = 0;

            combat.damageAt = 0;

            combat.damageApplied = false;
          }
        }

        /*
         * ======================================================
         * END ATTACK
         * ======================================================
         */

        if (
          combat.attacking &&
          now >= combat.attackUntil
        ) {
          combat.attacking = false;

          combat.damageApplied = false;
        }
      }

      /*
       * ========================================================
       * MONSTER COMBAT
       * ========================================================
       */

      for (const monster of monsters) {
        const ai = monster.monsterAI;

        if (
          !ai ||
          ai.state !== 'attack' ||
          !ai.target
        ) {
          continue;
        }

        /*
         * Only attack the local player for now.
         */
        if (
          ai.target !==
          world.playerEntity
        ) {
          continue;
        }

        /*
         * Attack animation is still running.
         */
        if (
          now <
          ai.attackUntil
        ) {
          continue;
        }

        /*
         * Damage was already applied.
         */
        if (ai.damageApplied) {
          continue;
        }

        ai.damageApplied = true;

        world.addComponent(
          ai.target,
          'damageNumber',
          {
            amount: MONSTER_DAMAGE,
            time: now,
          } as any
        );
      }
    },
  };
};