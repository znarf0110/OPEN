import { BudgeDragon } from '../../common/monsters/budgeDragon';
import { MonsterActionType } from '../../common/objects/enum';
import { createAttributeSystem } from '../../libs/attributeSystem';
import { Vector3 } from '../../libs/babylon/exports';
import { TERRAIN_SIZE } from '../../common/terrain/consts';
import type { ISystemFactory } from '../world';

const MONSTER_COUNT = 30;
const MIN_SPAWN_DISTANCE_FROM_TOWN = 35;
const MIN_DISTANCE_BETWEEN_MONSTERS = 5;
const MAX_SPAWN_ATTEMPTS = 40;

function distanceSquared(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export const MonsterSpawnSystem: ISystemFactory = world => {
  let spawned = false;

  return {
    update: () => {
      if (spawned || !world.terrain) return;

      // Wait for the local player so the field spawn can be placed relative to
      // the loaded map/player instead of spawning during the loading scene.
      const player = world.playerEntity;
      if (!player?.transform) return;

      const monsters: typeof player[] = [];

      for (let i = 0; i < MONSTER_COUNT; i++) {
        let x = 0;
        let z = 0;
        let found = false;

        for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
          // Field area: keep mobs away from the center/town area.
          x = 10 + Math.random() * (TERRAIN_SIZE - 20);
          z = 10 + Math.random() * (TERRAIN_SIZE - 20);

          if (
            distanceSquared(
              x,
              z,
              player.transform.pos.x,
              player.transform.pos.z
            ) < MIN_SPAWN_DISTANCE_FROM_TOWN ** 2
          ) {
            continue;
          }

          if (!world.isWalkable(~~x, ~~z)) continue;

          let tooClose = false;
          for (const other of monsters) {
            if (!other.transform) continue;

            if (
              distanceSquared(
                x,
                z,
                other.transform.pos.x,
                other.transform.pos.z
              ) < MIN_DISTANCE_BETWEEN_MONSTERS ** 2
            ) {
              tooClose = true;
              break;
            }
          }

          if (tooClose) continue;

          found = true;
          break;
        }

        if (!found) continue;

        const modelFactory = BudgeDragon;

        const monster = world.add({
          worldIndex: world.mapIndex,

          transform: {
            pos: new Vector3(
              x,
              world.getTerrainHeight(x, z),
              z
            ),
            rot: new Vector3(0, 0, 0),
            scale:
              modelFactory.OverrideScale >= 0
                ? modelFactory.OverrideScale
                : 1,
            posOffset: new Vector3(0.5, 0, 0.5),
          },

          modelFactory,

          pathfinding: {
            from: { x, y: z },
            to: { x, y: z },
            path: [],
            calculated: true,
          },

          movement: {
            velocity: { x: 0, y: 0 },
            running: false,
          },

          monsterAnimation: {
            action: MonsterActionType.Stop1,
          },

          monsterAI: {
            state: 'idle',
            target: null,
            spawnPosition: { x, y: z },
            aggroRadius: 8,
            attackRadius: 1.8,
            wanderRadius: 10,
            leashRadius: 60,
            lured: false,
            chaseStartedAt: 0,
            nextDecisionAt: 0,
            nextAttackAt: 0,
            attackUntil: 0,
            damageAt: 0,
            damageApplied: false,
            deathUntil: 0,
          },

          visibility: {
            lastChecked: 0,
            state: 'visible',
          },

          monsterHealth: {
            current: 100,
            max: 100,
          },

          attributeSystem: createAttributeSystem(),
          objectNameInWorld: 'Budge Dragon',
          interactable: true,
        });

        monster.attributeSystem?.setValue('isFemale', 0);
        monster.attributeSystem?.setValue('isFlying', 0);

        monsters.push(monster);
      }

      spawned = true;

      console.log(
        `[MONSTER SPAWN] Spawned ${monsters.length} Budge Dragons in the field`
      );
    },
  };
};
