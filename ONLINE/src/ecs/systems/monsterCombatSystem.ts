import type { Entity, ISystemFactory } from '../world';
import { MonsterActionType, PlayerAction } from '../../common/objects/enum';

const PLAYER_DAMAGE = 10;
const MONSTER_DAMAGE = 5;

const PLAYER_ATTACK_COOLDOWN = 0.80;
const MONSTER_ATTACK_COOLDOWN = 1.20;

// Attack animation hit point. 0.50 means damage lands at the middle
// of the real one-shot animation instead of at the end.
const PLAYER_DAMAGE_RATIO = 0.50;
const MONSTER_DAMAGE_RATIO = 0.58;

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
  const female = player.attributeSystem?.isAboveZero('isFemale') ?? false;
  return female
    ? PlayerAction.PLAYER_STOP_FEMALE
    : PlayerAction.PLAYER_STOP_MALE;
}

function getPlayerAttackDuration(player: Entity) {
  const model = player.modelObject as any;
  const measured = model?.getActionDuration?.(
    PlayerAction.PLAYER_ATTACK_FIST
  );

  if (typeof measured === 'number' && measured > 0.10 && measured < 3) {
    return measured;
  }

  return 0.65;
}

function requestEffect(
  world: Parameters<ISystemFactory>[0],
  caster: Entity,
  target: Entity | null,
  modelPath: string,
  position: { x: number; y: number; z: number },
  scale: number,
  duration: number
) {
  if (!target) return;

  world.addComponent(target, 'skillEffectRequest', {
    caster,
    target,
    skillId: 0,
    modelPath,
    position,
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

  return {
    update: () => {
      const now = world.gameTime.TotalGameTime.TotalSeconds;
      const localPlayer = world.playerEntity;

      // ============================================================
      // PLAYER -> MONSTER
      // ============================================================
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

        // Let the protected FIX5 movement system bring the player into range.
        if (d > combat.attackRange) {
          combat.attacking = false;
          combat.damageApplied = false;
          continue;
        }

        stop(player);

        // Face the monster before every attack.
        const dx = target.transform.pos.x - player.transform.pos.x;
        const dz = target.transform.pos.z - player.transform.pos.z;
        player.transform.rot.y = Math.atan2(dz, dx) + Math.PI / 2;

        // ------------------------------------------------------------
        // Start one real one-shot attack animation.
        // ------------------------------------------------------------
        if (
          !combat.attacking &&
          now >= combat.attackUntil + PLAYER_ATTACK_COOLDOWN
        ) {
          const duration = getPlayerAttackDuration(player);

          combat.attacking = true;
          combat.damageApplied = false;
          combat.attackUntil = now + duration;
          combat.damageAt = now + duration * PLAYER_DAMAGE_RATIO;
          player.playerAnimation.action = PlayerAction.PLAYER_ATTACK_FIST;
        }

        // ------------------------------------------------------------
        // Damage + character hit effect at the animation hit frame.
        // ------------------------------------------------------------
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
            target.monsterHealth.current = Math.max(
              0,
              target.monsterHealth.current - PLAYER_DAMAGE
            );

            world.addComponent(target, 'damageNumber', {
              amount: PLAYER_DAMAGE,
              time: now,
            });

            // Real MU effect converted from Effect/down_left_punch.bmd.
            requestEffect(
              world,
              player,
              target,
              './game-assets/Effect/down_left_punch.glb',
              {
                x: target.transform.pos.x,
                y: target.transform.pos.y + 0.30,
                z: target.transform.pos.z,
              },
              0.55,
              0.65
            );

            if (target.monsterHealth.current <= 0) {
              const ai = target.monsterAI;

              if (ai) {
                ai.target = null;
                ai.lured = false;
                ai.state = 'dead';
                ai.attackUntil = 0;
                ai.damageAt = 0;
                ai.damageApplied = false;
                ai.deathUntil = now + 1.5;
              }

              stop(target);
              target.monsterAnimation.action = MonsterActionType.Die;

              if (world.currentPointerTarget === target) {
                world.currentPointerTarget = null;
              }

              combat.target = null;
              combat.attacking = false;
            }
          }
        }

        if (combat.attacking && now >= combat.attackUntil) {
          combat.attacking = false;
          combat.damageApplied = false;
          player.playerAnimation.action = normalPlayerAction(player);
        }
      }

      // ============================================================
      // MONSTER -> PLAYER
      // ============================================================
      for (const monster of monsters) {
        const ai = monster.monsterAI;

        if (!ai || ai.state !== 'attack' || ai.target !== localPlayer) {
          continue;
        }

        if (monster.monsterHealth.current <= 0 || ai.state === 'dead') {
          continue;
        }

        if (now >= ai.damageAt && !ai.damageApplied) {
          ai.damageApplied = true;

          if (localPlayer) {
            world.addComponent(localPlayer, 'damageNumber', {
              amount: MONSTER_DAMAGE,
              time: now,
            });

            // Budge Dragon is documented as a flame-attacking monster.
            // This uses the FlameStrike BMD from the supplied MU Effect data.
            requestEffect(
              world,
              monster,
              localPlayer,
              './game-assets/Effect/FlameStrike.glb',
              {
                x: localPlayer.transform!.pos.x,
                y: localPlayer.transform!.pos.y + 0.25,
                z: localPlayer.transform!.pos.z,
              },
              0.45,
              0.90
            );
          }
        }

        // IMPORTANT: do not change the monster AI movement/state machine here.
        // The existing working MonsterAISystem owns the attack state transition.
      }
    },
  };
};
