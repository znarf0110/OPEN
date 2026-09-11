import { BudgeDragon } from '../../common/monsters/budgeDragon';
import { MonsterActionType } from '../../common/objects/enum';
import { ENUM_WORLD } from '../../common';
import { TWFlags } from '../../common/terrain/consts';
import { isFlagInBinaryMask } from '../../common/utils';
import { createAttributeSystem } from '../../libs/attributeSystem';
import { Vector3 } from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

// More monsters so the field is easier to test and observe.
const MONSTER_COUNT = 60;
const INITIAL_BATCH = 6;
const RESPAWN_BATCH = 2;
const SPAWN_INTERVAL = 0.25;
const RESPAWN_DELAY = 8;
const MIN_MONSTER_DISTANCE = 6;

type RespawnRequest = {
  x: number;
  z: number;
  respawnAt: number;
};

// Shared only between MonsterCombatSystem and MonsterSpawnSystem.
// A dead monster records its exact original spawn point here so the
// replacement can come back to the same place instead of a random spot.
const pendingRespawns: RespawnRequest[] = [];

export function queueMonsterRespawn(
  x: number,
  z: number,
  respawnAt: number
) {
  pendingRespawns.push({ x, z, respawnAt });
}

const TOWN_X = 135;
const TOWN_Z = 131;
const TOWN_RADIUS = 45;

function d2(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function isField(world: Parameters<ISystemFactory>[0], x: number, z: number) {
  if (x < 4 || z < 4 || x > 251 || z > 251) return false;
  if (!world.isWalkable(~~x, ~~z)) return false;

  const inFieldBand =
    (x >= 10 && x <= 105 && z >= 35 && z <= 225) ||
    (x >= 165 && x <= 246 && z >= 35 && z <= 225) ||
    (x >= 70 && x <= 195 && z >= 10 && z <= 80) ||
    (x >= 70 && x <= 195 && z >= 180 && z <= 246);

  if (!inFieldBand) return false;
  if (d2({ x, z }, { x: TOWN_X, z: TOWN_Z }) < TOWN_RADIUS * TOWN_RADIUS) return false;

  const flag = world.getTerrainFlag(~~x, ~~z);
  return (
    !isFlagInBinaryMask(flag, TWFlags.SafeZone) &&
    !isFlagInBinaryMask(flag, TWFlags.NoMove) &&
    !isFlagInBinaryMask(flag, TWFlags.NoGround)
  );
}

function getMonsterCount(world: Parameters<ISystemFactory>[0]) {
  let count = 0;

  for (const entity of world.with('monsterAI', 'monsterHealth', 'transform')) {
    if (entity.worldIndex === ENUM_WORLD.WD_0LORENCIA) {
      count++;
    }
  }

  return count;
}

function findSpawnPosition(
  world: Parameters<ISystemFactory>[0],
  existing: Entity[]
) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = 10 + Math.random() * 236;
    const z = 10 + Math.random() * 236;

    if (!isField(world, x, z)) continue;

    // Keep the field spread out so the extra monsters do not stack.
    if (
      existing.some(
        monster =>
          monster.transform &&
          d2({ x, z }, {
            x: monster.transform.pos.x,
            z: monster.transform.pos.z,
          }) < MIN_MONSTER_DISTANCE * MIN_MONSTER_DISTANCE
      )
    ) {
      continue;
    }

    return { x, z };
  }

  return null;
}

function createMonster(
  world: Parameters<ISystemFactory>[0],
  pos: { x: number; z: number }
) {
  const factory = BudgeDragon;

  const monster = world.add({
    worldIndex: ENUM_WORLD.WD_0LORENCIA,
    transform: {
      pos: new Vector3(
        pos.x,
        world.getTerrainHeight(pos.x, pos.z),
        pos.z
      ),
      rot: new Vector3(0, 0, 0),
      scale: factory.OverrideScale >= 0 ? factory.OverrideScale : 1,
      posOffset: new Vector3(0.5, 0, 0.5),
    },
    modelFactory: factory,
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
      spawnPosition: { x: pos.x, y: pos.z },
      aggroRadius: 10,
      attackRadius: 2.2,
      wanderRadius: 18,
      leashRadius: 0,
      lured: false,
      chaseStartedAt: 0,
      nextDecisionAt:
        world.gameTime.TotalGameTime.TotalSeconds + Math.random() * 4,
      nextPathAt: 0,
      lastTargetX: pos.x,
      lastTargetZ: pos.z,
      nextAttackAt: 0,
      attackUntil: 0,
      damageAt: 0,
      damageApplied: false,
      deathUntil: 0,
    },
    monsterHealth: {
      current: 100,
      max: 100,
    },
    screenPosition: {
      x: 0,
      y: 0,
      worldOffsetZ: 2.8,
    },
    visibility: {
      state: 'hidden',
      lastChecked: 0,
    },
    attributeSystem: createAttributeSystem(),
    objectNameInWorld: 'Budge Dragon',
    interactable: true,
  });

  monster.attributeSystem?.setValue('isFemale', 0);
  monster.attributeSystem?.setValue('isFlying', 0);

  return monster;
}

export const MonsterSpawnSystem: ISystemFactory = world => {
  let spawnTimer = 0;
  let initialComplete = false;
  let lastCount = 0;
  let lastDeathAt = -Infinity;

  return {
    update: dt => {
      if (world.mapIndex !== ENUM_WORLD.WD_0LORENCIA) return;
      if (!world.terrain || !world.playerEntity?.transform) return;

      spawnTimer -= dt;

      const currentCount = getMonsterCount(world);

      // Initial population: add a few per tick instead of creating all
      // 60 models in one frame and causing a browser hitch.
      if (!initialComplete) {
        if (currentCount >= MONSTER_COUNT) {
          initialComplete = true;
          lastCount = currentCount;
          return;
        }

        if (spawnTimer > 0) return;
        spawnTimer = SPAWN_INTERVAL;

        const amount = Math.min(
          INITIAL_BATCH,
          MONSTER_COUNT - currentCount
        );

        const existing = [
          ...world.with('monsterAI', 'transform'),
        ];

        let created = 0;
        for (let i = 0; i < amount; i++) {
          const pos = findSpawnPosition(world, existing);
          if (!pos) break;

          const monster = createMonster(world, pos);
          existing.push(monster);
          created++;
        }

        if (created > 0) {
          console.log(
            `[MONSTER SPAWN] initial +${created} (${currentCount + created}/${MONSTER_COUNT})`
          );
        }

        return;
      }

      lastCount = currentCount;

      // Respawn dead monsters at their ORIGINAL spawn position after 8 seconds.
      // If that exact tile is no longer valid/available, use a nearby valid tile.
      if (currentCount < MONSTER_COUNT && pendingRespawns.length > 0) {
        pendingRespawns.sort((a, b) => a.respawnAt - b.respawnAt);

        let created = 0;

        while (
          created < RESPAWN_BATCH &&
          currentCount + created < MONSTER_COUNT &&
          pendingRespawns.length > 0
        ) {
          const request = pendingRespawns[0];

          if (request.respawnAt > world.gameTime.TotalGameTime.TotalSeconds) {
            break;
          }

          pendingRespawns.shift();

          const existing = [
            ...world.with('monsterAI', 'transform'),
          ];

          let pos: { x: number; z: number } | null = null;

          // Prefer the exact original spawn location.
          if (
            isField(world, request.x, request.z) &&
            !existing.some(
              monster =>
                monster.transform &&
                d2(
                  { x: request.x, z: request.z },
                  {
                    x: monster.transform.pos.x,
                    z: monster.transform.pos.z,
                  }
                ) < MIN_MONSTER_DISTANCE * MIN_MONSTER_DISTANCE
            )
          ) {
            pos = { x: request.x, z: request.z };
          } else {
            pos = findSpawnPosition(world, existing);
          }

          if (!pos) {
            // Try again on a later update rather than losing the respawn.
            pendingRespawns.unshift(request);
            break;
          }

          const monster = createMonster(world, pos);
          created++;

          console.log(
            `[MONSTER RESPAWN] ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)} (${currentCount + created}/${MONSTER_COUNT})`
          );
        }

        if (created > 0) {
          spawnTimer = SPAWN_INTERVAL;
        }
      }

      // Safety refill: if a monster was removed without going through the
      // combat death path, refill the population at valid field locations.
      const afterRespawnCount = getMonsterCount(world);
      if (
        afterRespawnCount < MONSTER_COUNT &&
        pendingRespawns.length === 0 &&
        spawnTimer <= 0
      ) {
        spawnTimer = SPAWN_INTERVAL;

        const amount = Math.min(
          RESPAWN_BATCH,
          MONSTER_COUNT - afterRespawnCount
        );

        const existing = [
          ...world.with('monsterAI', 'transform'),
        ];

        for (let i = 0; i < amount; i++) {
          const pos = findSpawnPosition(world, existing);
          if (!pos) break;
          const monster = createMonster(world, pos);
          existing.push(monster);
        }
      }
    },
  };
};
