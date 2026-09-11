import { MonsterActionType } from '../../common/objects/enum';
import type { Entity, ISystemFactory } from '../world';

const WANDER_INTERVAL_MIN = 2;
const WANDER_INTERVAL_MAX = 5;
const ATTACK_INTERVAL = 1;
const LURED_TIMEOUT = 120;

function distanceSquared(
  a: { x: number; z: number },
  b: { x: number; z: number }
) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function setDestination(
  monster: Entity,
  x: number,
  z: number
) {
  if (!monster.transform || !monster.pathfinding) return;

  monster.pathfinding.from.x = monster.transform.pos.x;
  monster.pathfinding.from.y = monster.transform.pos.z;
  monster.pathfinding.to.x = ~~x;
  monster.pathfinding.to.y = ~~z;
  monster.pathfinding.path = null;
  monster.pathfinding.calculated = false;
}

function stop(monster: Entity) {
  if (!monster.movement || !monster.pathfinding) return;

  monster.movement.velocity.x = 0;
  monster.movement.velocity.y = 0;
  monster.pathfinding.path = [];
  monster.pathfinding.calculated = true;
}

function chooseWanderDestination(
  world: Parameters<ISystemFactory>[0],
  monster: Entity
) {
  const ai = monster.monsterAI;
  const transform = monster.transform;

  if (!ai || !transform) return;

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * ai.wanderRadius;

  const x = ai.spawnPosition.x + Math.cos(angle) * radius;
  const z = ai.spawnPosition.y + Math.sin(angle) * radius;

  if (!world.isWalkable(~~x, ~~z)) return;

  setDestination(monster, x, z);
  ai.nextDecisionAt =
    world.gameTime.TotalGameTime.TotalSeconds +
    randomBetween(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX);
}

function startChase(
  world: Parameters<ISystemFactory>[0],
  monster: Entity,
  target: Entity,
  lured: boolean
) {
  const ai = monster.monsterAI;
  if (!ai) return;

  ai.target = target;
  ai.lured = lured;
  ai.state = lured ? 'lured' : 'chase';
  ai.chaseStartedAt =
    world.gameTime.TotalGameTime.TotalSeconds;

  if (target.transform) {
    setDestination(
      monster,
      target.transform.pos.x,
      target.transform.pos.z
    );
  }
}

function returnToSpawn(
  world: Parameters<ISystemFactory>[0],
  monster: Entity
) {
  const ai = monster.monsterAI;
  if (!ai) return;

  ai.target = null;
  ai.lured = false;
  ai.state = 'return';

  setDestination(
    monster,
    ai.spawnPosition.x,
    ai.spawnPosition.y
  );
}

export const MonsterAISystem: ISystemFactory = world => {
  const query = world.with(
    'monsterAI',
    'transform',
    'pathfinding',
    'movement',
    'monsterAnimation'
  );

  return {
    update: dt => {
      const player = world.playerEntity;
      const now = world.gameTime.TotalGameTime.TotalSeconds;

      for (const monster of query) {
        const ai = monster.monsterAI;
        const transform = monster.transform;

        if (!ai || !transform) continue;

        if (ai.state === 'dead') {
          stop(monster);
          monster.monsterAnimation.action = MonsterActionType.Die;
          continue;
        }

        const playerAlive =
          !!player?.transform &&
          player.visibility?.state !== 'hidden';

        // --------------------------------------------------
        // No valid target
        // --------------------------------------------------
        if (!ai.target) {
          if (
            playerAlive &&
            distanceSquared(
              transform.pos,
              player!.transform!.pos
            ) <= ai.aggroRadius ** 2
          ) {
            startChase(world, monster, player!, false);
            continue;
          }

          if (ai.state === 'return') {
            if (
              distanceSquared(
                transform.pos,
                {
                  x: ai.spawnPosition.x,
                  z: ai.spawnPosition.y,
                }
              ) < 1.5 ** 2
            ) {
              ai.state = 'idle';
              ai.nextDecisionAt = now + randomBetween(1, 3);
              stop(monster);
            }

            continue;
          }

          if (now >= ai.nextDecisionAt) {
            ai.state = 'wander';
            chooseWanderDestination(world, monster);
          }

          continue;
        }

        const target = ai.target;

        // --------------------------------------------------
        // Target disappeared/dead/invalid
        // --------------------------------------------------
        if (
          !target.transform ||
          target.visibility?.state === 'hidden'
        ) {
          returnToSpawn(world, monster);
          continue;
        }

        // --------------------------------------------------
        // Intentional lure
        //
        // IMPORTANT:
        // Distance does NOT cancel a lure.
        // --------------------------------------------------
        if (ai.lured) {
          if (now - ai.chaseStartedAt > LURED_TIMEOUT) {
            returnToSpawn(world, monster);
            continue;
          }
        } else {
          // Normal aggro has a leash based on aggro radius.
          if (
            distanceSquared(
              transform.pos,
              target.transform.pos
            ) > ai.aggroRadius ** 2
          ) {
            returnToSpawn(world, monster);
            continue;
          }
        }

        const targetDistance = Math.sqrt(
          distanceSquared(
            transform.pos,
            target.transform.pos
          )
        );

        // --------------------------------------------------
        // Attack range
        // --------------------------------------------------
        if (targetDistance <= ai.attackRadius) {
          stop(monster);
          ai.state = 'attack';

          // Attack1 finished: clear the active attack so the
          // monster can start another attack or continue chasing.
          if (ai.attackUntil > 0 && now >= ai.attackUntil) {
            ai.attackUntil = 0;
            ai.damageAt = 0;
            ai.damageApplied = false;
          }

          if (ai.attackUntil <= 0 && now >= ai.nextAttackAt) {
            monster.monsterAnimation.action =
              MonsterActionType.Attack1;

            let duration = 0.65;

            if (monster.modelObject) {
              const measured =
                monster.modelObject.getActionDuration(
                  MonsterActionType.Attack1
                );

              if (measured > 0.05 && measured < 5) {
                duration = measured;
              }
            }

            ai.attackUntil = now + duration;
            ai.damageAt = now + duration * 0.58;
            ai.nextAttackAt = now + duration + ATTACK_INTERVAL;
            ai.damageApplied = false;
          }

          continue;
        }

        // --------------------------------------------------
        // Chase
        // --------------------------------------------------
        ai.state = ai.lured ? 'lured' : 'chase';

        // Recalculate the destination repeatedly so the mob
        // follows a moving player.
        setDestination(
          monster,
          target.transform.pos.x,
          target.transform.pos.z
        );
      }

      void dt;
    },
  };
};
