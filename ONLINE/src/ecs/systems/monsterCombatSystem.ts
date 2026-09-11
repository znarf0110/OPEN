import type { Entity, ISystemFactory } from '../world';
import {
  MonsterActionType,
  PlayerAction,
} from '../../common/objects/enum';
import type { PlayerObject } from '../../common/playerObject';

const PLAYER_DAMAGE = 10;
const MONSTER_DAMAGE = 5;

const PLAYER_ATTACK_COOLDOWN = 0.12;

const PLAYER_DAMAGE_RATIO = 0.48;
const MONSTER_DAMAGE_RATIO = 0.58;

const PLAYER_ATTACK_EFFECT =
  './game-assets/Effect/shockwave_spin01.glb';

const MONSTER_ATTACK_EFFECT =
  './game-assets/Effect/FlameStrike.glb';

function stop(entity: Entity) {
  if (!entity.movement) return;

  entity.movement.velocity.x = 0;
  entity.movement.velocity.y = 0;
  entity.movement.running = false;
}

function distance(a: Entity, b: Entity) {
  if (!a.transform || !b.transform) return Infinity;

  const dx = b.transform.pos.x - a.transform.pos.x;
  const dz = b.transform.pos.z - a.transform.pos.z;

  return Math.sqrt(dx * dx + dz * dz);
}

function normalPlayerAction(player: Entity) {
  const female =
    player.attributeSystem?.isAboveZero('isFemale') ?? false;

  return female
    ? PlayerAction.PLAYER_STOP_FEMALE
    : PlayerAction.PLAYER_STOP_MALE;
}

function hasWeapon(player: Entity) {
  const model = player.modelObject as PlayerObject | undefined;

  if (!model) return false;

  return !!model.Weapon1?.gltf?.mesh;
}

function getWeaponAttackAction(
  player: Entity,
  sequence: number
) {
  if (!hasWeapon(player)) {
    return PlayerAction.PLAYER_ATTACK_FIST;
  }

  // MU sword attacks alternate between the two right-hand
  // attack actions. The weapon is already attached to socket 33
  // in PlayerObject, so the sword follows the animated hand.
  return sequence % 2 === 0
    ? PlayerAction.PLAYER_ATTACK_SWORD_RIGHT1
    : PlayerAction.PLAYER_ATTACK_SWORD_RIGHT2;
}

function getAttackDuration(
  player: Entity,
  action: PlayerAction
) {
  const model = player.modelObject as PlayerObject | undefined;

  const measured =
    model?.getActionDuration?.(action) ?? 0;

  if (measured > 0.20 && measured < 3.0) {
    return measured;
  }

  // Safe fallback for old/invalid GLBs.
  return 0.72;
}

function requestEffect(
  world: Parameters<ISystemFactory>[0],
  caster: Entity,
  target: Entity,
  modelPath: string,
  scale: number,
  duration: number
) {
  if (!target.transform) return;

  world.addComponent(target, 'skillEffectRequest', {
    caster,
    target,
    skillId: 0,
    modelPath,
    position: {
      x: target.transform.pos.x,
      y: target.transform.pos.y + 0.45,
      z: target.transform.pos.z,
    },
    scale,
    duration,
  });
}

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
    'transform',
    'movement',
    'monsterAnimation'
  );

  let playerAttackSequence = 0;

  return {
    update: () => {
      const now =
        world.gameTime.TotalGameTime.TotalSeconds;

      const localPlayer = world.playerEntity;

      // ==========================================================
      // PLAYER -> MONSTER
      // ==========================================================
      for (const player of players) {
        const combat = player.playerCombat;
        const target = combat.target;

        if (!target?.transform || !target.monsterHealth) {
          combat.attacking = false;
          combat.target = null;
          continue;
        }

        if (
          target.monsterHealth.current <= 0 ||
          target.monsterAI?.state === 'dead'
        ) {
          combat.attacking = false;
          combat.target = null;
          continue;
        }

        const d = distance(player, target);

        // The protected movement system moves the player toward
        // the selected monster. Do not touch monster movement here.
        if (d > combat.attackRange) {
          combat.attacking = false;
          combat.damageApplied = false;
          continue;
        }

        stop(player);

        // Face the monster before the weapon swing.
        const dx =
          target.transform.pos.x -
          player.transform.pos.x;

        const dz =
          target.transform.pos.z -
          player.transform.pos.z;

        player.transform.rot.y =
          Math.atan2(dz, dx) + Math.PI / 2;

        if (
          !combat.attacking &&
          now >= combat.attackUntil +
            PLAYER_ATTACK_COOLDOWN
        ) {
          const action =
            getWeaponAttackAction(
              player,
              playerAttackSequence++
            );

          const duration =
            getAttackDuration(
              player,
              action
            );

          combat.attacking = true;
          combat.damageApplied = false;
          combat.attackUntil =
            now + duration;
          combat.damageAt =
            now +
            duration *
              PLAYER_DAMAGE_RATIO;

          // This is the important change:
          // use the weapon attack animation instead of fist.
          player.playerAnimation.action =
            action;
        }

        // Hit frame.
        if (
          combat.attacking &&
          !combat.damageApplied &&
          now >= combat.damageAt
        ) {
          combat.damageApplied = true;

          if (
            target.monsterHealth.current > 0 &&
            target.monsterAI?.state !== 'dead'
          ) {
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
              }
            );

            // Sword impact / slash effect.
            requestEffect(
              world,
              player,
              target,
              PLAYER_ATTACK_EFFECT,
              0.72,
              0.55
            );

            if (
              target.monsterHealth.current <= 0
            ) {
              const ai =
                target.monsterAI;

              if (ai) {
                ai.target = null;
                ai.lured = false;
                ai.state = 'dead';
                ai.attackUntil = 0;
                ai.damageAt = 0;
                ai.damageApplied = false;
                ai.deathUntil =
                  now + 1.5;
              }

              stop(target);

              target.monsterAnimation.action =
                MonsterActionType.Die;

              if (
                world.currentPointerTarget ===
                target
              ) {
                world.currentPointerTarget =
                  null;
              }

              combat.target = null;
              combat.attacking = false;
            }
          }
        }

        if (
          combat.attacking &&
          now >= combat.attackUntil
        ) {
          combat.attacking = false;
          combat.damageApplied = false;

          if (combat.target) {
            player.playerAnimation.action =
              normalPlayerAction(player);
          }
        }
      }

      // ==========================================================
      // MONSTER -> PLAYER
      // ==========================================================
      for (const monster of monsters) {
        const ai = monster.monsterAI;

        if (
          !ai ||
          ai.state !== 'attack' ||
          ai.target !== localPlayer
        ) {
          continue;
        }

        if (
          monster.monsterHealth.current <= 0 ||
          ai.state === 'dead'
        ) {
          continue;
        }

        if (
          now >= ai.damageAt &&
          !ai.damageApplied
        ) {
          ai.damageApplied = true;

          if (localPlayer) {
            world.addComponent(
              localPlayer,
              'damageNumber',
              {
                amount: MONSTER_DAMAGE,
                time: now,
              }
            );

            // Budge Dragon flame attack.
            requestEffect(
              world,
              monster,
              localPlayer,
              MONSTER_ATTACK_EFFECT,
              0.60,
              0.90
            );
          }
        }

        // IMPORTANT:
        // Monster AI owns its attack/chase state.
        // Do not reset ai.state here.
      }
    },
  };
};
