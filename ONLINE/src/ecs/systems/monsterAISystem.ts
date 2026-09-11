import { MonsterActionType } from '../../common/objects/enum';
import { TWFlags } from '../../common/terrain/consts';
import { isFlagInBinaryMask } from '../../common/utils';
import { ENUM_WORLD } from '../../common';
import type { Entity, ISystemFactory } from '../world';

const AGGRO_RADIUS = 10;
const ATTACK_RADIUS = 2.2;
const MONSTER_SPEED = 2.2;
const WANDER_SPEED = 1.4;
const WANDER_MIN = 2;
const WANDER_MAX = 5;
const LURE_TIMEOUT = 120;
const ATTACK_DURATION = 0.75;
const ATTACK_COOLDOWN = 1.4;

const TOWN = { x: 135, z: 131, radius: 45 };

function d2(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function isField(world: Parameters<ISystemFactory>[0], x: number, z: number) {
  if (x < 4 || z < 4 || x > 251 || z > 251) return false;
  if (!world.isWalkable(~~x, ~~z)) return false;

  // Hard field bands. This prevents mobs from appearing in the Lorencia town
  // even if a terrain flag happens to be inconsistent around the town edge.
  const inFieldBand =
    (x >= 10 && x <= 105 && z >= 35 && z <= 225) ||
    (x >= 165 && x <= 246 && z >= 35 && z <= 225) ||
    (x >= 70 && x <= 195 && z >= 10 && z <= 80) ||
    (x >= 70 && x <= 195 && z >= 180 && z <= 246);

  if (!inFieldBand) return false;
  if (d2({ x, z }, TOWN) < TOWN.radius * TOWN.radius) return false;

  const flag = world.getTerrainFlag(~~x, ~~z);
  if (isFlagInBinaryMask(flag, TWFlags.SafeZone)) return false;
  if (isFlagInBinaryMask(flag, TWFlags.NoMove)) return false;
  if (isFlagInBinaryMask(flag, TWFlags.NoGround)) return false;

  return true;
}

function stop(monster: Entity) {
  if (!monster.movement) return;
  monster.movement.velocity.x = 0;
  monster.movement.velocity.y = 0;
  monster.movement.running = false;
}

function move(monster: Entity, dx: number, dz: number, speed: number) {
  if (!monster.movement) return;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) {
    stop(monster);
    return;
  }
  monster.movement.velocity.x = (dx / len) * speed;
  monster.movement.velocity.y = (dz / len) * speed;
  monster.movement.running = true;
  monster.transform!.rot.y = Math.atan2(monster.movement.velocity.y, monster.movement.velocity.x) + Math.PI / 2;
}

function tryMove(world: Parameters<ISystemFactory>[0], monster: Entity, dx: number, dz: number, speed: number) {
  const p = monster.transform!.pos;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const nx = p.x + (dx / len) * speed * 0.35;
  const nz = p.z + (dz / len) * speed * 0.35;
  if (isField(world, nx, nz)) {
    move(monster, dx, dz, speed);
    return true;
  }
  return false;
}

function wander(world: Parameters<ISystemFactory>[0], monster: Entity, now: number) {
  const ai = monster.monsterAI!;
  const p = monster.transform!.pos;

  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 4 + Math.random() * 18;
    const x = p.x + Math.cos(angle) * radius;
    const z = p.z + Math.sin(angle) * radius;
    if (!isField(world, x, z)) continue;

    ai.state = 'wander';
    ai.nextDecisionAt = now + WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
    ai.lastTargetX = x;
    ai.lastTargetZ = z;
    return;
  }

  ai.nextDecisionAt = now + 1;
}

export const MonsterAISystem: ISystemFactory = world => {
  const query = world.with('monsterAI', 'transform', 'movement', 'monsterAnimation');

  return {
    update: dt => {
      const player = world.playerEntity;
      const now = world.gameTime.TotalGameTime.TotalSeconds;

      for (const monster of query) {
        if (monster.worldIndex !== world.mapIndex) continue;
        const ai = monster.monsterAI;
        const p = monster.transform.pos;
        if (!ai) continue;

        if (monster.monsterHealth && monster.monsterHealth.current <= 0) {
          stop(monster);
          ai.state = 'idle';
          monster.monsterAnimation.action = MonsterActionType.Stop1;
          continue;
        }

        const playerValid = !!player?.transform && player.worldIndex === monster.worldIndex;

        // Acquire normal aggro only while the player is near the monster.
        if (!ai.target && playerValid && d2(p, player!.transform!.pos) <= AGGRO_RADIUS * AGGRO_RADIUS) {
          ai.target = player!;
          ai.lured = false;
          ai.state = 'aggro';
          ai.chaseStartedAt = now;
          ai.nextAttackAt = now;
        }

        // No target = either return to the original spawn point or roam.
        if (!ai.target) {
          if (ai.state === 'return') {
            const dx = ai.spawnPosition.x - p.x;
            const dz = ai.spawnPosition.y - p.z;
            if (dx * dx + dz * dz <= 2.5 * 2.5) {
              stop(monster);
              ai.state = 'idle';
              ai.nextDecisionAt = now + 1 + Math.random() * 2;
              monster.monsterAnimation.action = MonsterActionType.Stop1;
            } else if (!tryMove(world, monster, dx, dz, MONSTER_SPEED)) {
              // If the direct route is blocked, pick a new field direction.
              ai.state = 'idle';
              ai.nextDecisionAt = now + 0.5;
            } else {
              monster.monsterAnimation.action = MonsterActionType.Walk;
            }
            continue;
          }

          if (ai.state === 'attack' || ai.state === 'chase' || ai.state === 'lured' || ai.state === 'aggro') {
            ai.state = 'idle';
          }

          if (now >= ai.nextDecisionAt) wander(world, monster, now);

          const dx = ai.lastTargetX - p.x;
          const dz = ai.lastTargetZ - p.z;
          if (dx * dx + dz * dz < 2.0) {
            stop(monster);
            monster.monsterAnimation.action = MonsterActionType.Stop1;
          } else if (!tryMove(world, monster, dx, dz, WANDER_SPEED)) {
            ai.nextDecisionAt = now;
          } else {
            monster.monsterAnimation.action = MonsterActionType.Walk;
          }
          continue;
        }

        const target = ai.target;
        if (!target.transform || target.worldIndex !== monster.worldIndex) {
          ai.target = null;
          ai.lured = false;
          ai.state = 'return';
          ai.nextDecisionAt = now;
          continue;
        }

        // Intentional lure never resets because of distance.
        if (ai.lured && now - ai.chaseStartedAt > LURE_TIMEOUT) {
          ai.target = null;
          ai.lured = false;
          ai.state = 'return';
          ai.nextDecisionAt = now;
          continue;
        }

        if (!ai.lured && d2(p, target.transform.pos) > AGGRO_RADIUS * AGGRO_RADIUS) {
          ai.target = null;
          ai.state = 'return';
          ai.nextDecisionAt = now;
          continue;
        }

        const dx = target.transform.pos.x - p.x;
        const dz = target.transform.pos.z - p.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= ATTACK_RADIUS) {
          stop(monster);
          ai.state = 'attack';
          monster.monsterAnimation.action = MonsterActionType.Attack1;

          if (now >= ai.nextAttackAt) {
            ai.nextAttackAt = now + ATTACK_COOLDOWN;
            ai.attackUntil = now + ATTACK_DURATION;
            ai.damageApplied = false;
          }

          if (now >= ai.attackUntil) {
            monster.monsterAnimation.action = MonsterActionType.Stop1;
          }
          continue;
        }

        ai.state = ai.lured ? 'lured' : 'chase';
        if (!tryMove(world, monster, dx, dz, MONSTER_SPEED)) {
          // Try a small side step if a straight line is blocked.
          const sideX = -dz;
          const sideZ = dx;
          if (!tryMove(world, monster, sideX, sideZ, MONSTER_SPEED)) {
            stop(monster);
          }
        }
        monster.monsterAnimation.action = MonsterActionType.Walk;
      }

      void dt;
    },
  };
};
