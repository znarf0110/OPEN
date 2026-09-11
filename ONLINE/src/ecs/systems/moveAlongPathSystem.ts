import { Scalar } from '../../libs/babylon/exports';
import { Store } from '../../store';
import { TWFlags } from '../../common/terrain/consts';
import { isFlagInBinaryMask } from '../../common/utils';
import type { Entity, ISystemFactory } from '../world';

const EPSILON = 0.0001;

function stop(entity: Entity) {
  entity.movement!.velocity.x = 0;
  entity.movement!.velocity.y = 0;
}

function applyVelocity(
  world: Parameters<ISystemFactory>[0],
  entity: Entity,
  deltaTime: number
) {
  const { transform, movement } = entity;
  if (!transform || !movement) return false;

  const vx = movement.velocity.x;
  const vz = movement.velocity.y;

  if (Math.abs(vx) < EPSILON && Math.abs(vz) < EPSILON) {
    return false;
  }

  transform.pos.x += vx * deltaTime;
  transform.pos.z += vz * deltaTime;

  transform.rot.y = Math.atan2(vz, vx) + Math.PI / 2;

  if (world.terrain) {
    const x = ~~transform.pos.x;
    const z = ~~transform.pos.z;

    const flag = world.getTerrainFlag(x, z);

    // Never let direct movement cross an impassable terrain tile.
    if (
      isFlagInBinaryMask(flag, TWFlags.NoMove) ||
      isFlagInBinaryMask(flag, TWFlags.NoGround)
    ) {
      transform.pos.x -= vx * deltaTime;
      transform.pos.z -= vz * deltaTime;
      stop(entity);
      return false;
    }

    const h = world.getTerrainHeight(x, z);

    if (h > -9000) {
      transform.pos.y = Scalar.Lerp(
        transform.pos.y,
        h,
        Math.min(1, 15 * deltaTime)
      );
    }

    if (entity.attributeSystem) {
      entity.attributeSystem.setValue(
        'inSafeZone',
        isFlagInBinaryMask(flag, TWFlags.SafeZone) ? 1 : 0
      );
    }
  }

  return true;
}

export const MoveAlongPathSystem: ISystemFactory = world => {
  const query = world.with('transform', 'movement');

  return {
    update: (deltaTime: number) => {
      for (const entity of query) {
        const {
          transform,
          movement,
          localPlayer,
          attributeSystem,
        } = entity;

        if (!transform || !movement) continue;

        /*
         * PLAYER COMBAT MOVEMENT
         *
         * When the player has selected a monster, move directly
         * toward it until attack range is reached.
         */
        const combat = entity.playerCombat;
        const target = combat?.target;

        if (combat && target?.transform && !combat.attacking) {
          const dx = target.transform.pos.x - transform.pos.x;
          const dz = target.transform.pos.z - transform.pos.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          if (distance > combat.attackRange) {
            const len = distance || 1;

            movement.velocity.x =
              (dx / len) * 3.8;
            movement.velocity.y =
              (dz / len) * 3.8;
            movement.running = true;

            applyVelocity(world, entity, deltaTime);
          } else {
            stop(entity);
            movement.running = false;
          }

          continue;
        }

        /*
         * MONSTER DIRECT MOVEMENT
         *
         * MonsterAISystem intentionally does not use A*.
         * It writes velocity; this system must actually apply
         * that velocity to the monster transform.
         */
        if (entity.monsterAI) {
          const moving = applyVelocity(
            world,
            entity,
            deltaTime
          );

          if (!moving) {
            movement.running = false;
          }

          continue;
        }

        /*
         * NORMAL PLAYER PATH MOVEMENT
         */
        const pathfinding = entity.pathfinding;

        if (!pathfinding) {
          stop(entity);
          continue;
        }

        if (localPlayer) {
          Store.playerData.setPosition(
            ~~transform.pos.x,
            ~~transform.pos.z
          );

          const flag = world.getTerrainFlag(
            ~~transform.pos.x,
            ~~transform.pos.z
          );

          Store.playerData.setTileFlag(flag);
        }

        const speed =
          attributeSystem?.getValue(
            'totalMovementSpeed'
          ) ?? 4;

        let deltaSpeed =
          speed * deltaTime;

        if (
          !pathfinding.path ||
          pathfinding.path.length === 0 ||
          !pathfinding.calculated
        ) {
          stop(entity);
          continue;
        }

        while (
          deltaSpeed > 0 &&
          pathfinding.path.length > 0
        ) {
          const nextPoint =
            pathfinding.path[0];

          const dx =
            nextPoint.x - transform.pos.x;

          const dz =
            nextPoint.y - transform.pos.z;

          const distance =
            Math.sqrt(dx * dx + dz * dz);

          if (distance < EPSILON) {
            pathfinding.path.shift();
            continue;
          }

          const deltaDistance =
            Math.min(deltaSpeed, distance);

          deltaSpeed -= deltaDistance;

          movement.velocity.x =
            (dx / distance) * speed;

          movement.velocity.y =
            (dz / distance) * speed;

          movement.running = !!localPlayer;

          transform.pos.x +=
            (dx / distance) * deltaDistance;

          transform.pos.z +=
            (dz / distance) * deltaDistance;

          transform.rot.y =
            Math.atan2(
              movement.velocity.y,
              movement.velocity.x
            ) + Math.PI / 2;

          if (
            deltaDistance >=
            distance - EPSILON
          ) {
            pathfinding.path.shift();
          }

          if (world.terrain) {
            const x = ~~transform.pos.x;
            const z = ~~transform.pos.z;

            const flag =
              world.getTerrainFlag(x, z);

            const h =
              world.getTerrainHeight(x, z);

            if (h > -9000) {
              transform.pos.y =
                Scalar.Lerp(
                  transform.pos.y,
                  h,
                  Math.min(1, 15 * deltaTime)
                );
            }

            if (attributeSystem) {
              attributeSystem.setValue(
                'inSafeZone',
                isFlagInBinaryMask(
                  flag,
                  TWFlags.SafeZone
                )
                  ? 1
                  : 0
              );
            }
          }
        }
      }
    },
  };
};
