import { BudgeDragon } from '../../common/monsters/budgeDragon';
import { MonsterActionType } from '../../common/objects/enum';
import { ENUM_WORLD } from '../../common';
import { TWFlags } from '../../common/terrain/consts';
import { isFlagInBinaryMask } from '../../common/utils';
import { createAttributeSystem } from '../../libs/attributeSystem';
import { Vector3 } from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

const MONSTER_COUNT = 24;
const TOWN_X = 135;
const TOWN_Z = 131;
const TOWN_RADIUS = 45;

function d2(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function isField(world: Parameters<ISystemFactory>[0], x: number, z: number) {
  if (!world.isWalkable(~~x, ~~z)) return false;

  const inFieldBand =
    (x >= 10 && x <= 105 && z >= 35 && z <= 225) ||
    (x >= 165 && x <= 246 && z >= 35 && z <= 225) ||
    (x >= 70 && x <= 195 && z >= 10 && z <= 80) ||
    (x >= 70 && x <= 195 && z >= 180 && z <= 246);

  if (!inFieldBand) return false;
  if (d2({ x, z }, { x: TOWN_X, z: TOWN_Z }) < TOWN_RADIUS * TOWN_RADIUS) return false;

  const flag = world.getTerrainFlag(~~x, ~~z);
  return !isFlagInBinaryMask(flag, TWFlags.SafeZone) &&
    !isFlagInBinaryMask(flag, TWFlags.NoMove) &&
    !isFlagInBinaryMask(flag, TWFlags.NoGround);
}

export const MonsterSpawnSystem: ISystemFactory = world => {
  let done = false;

  return {
    update: () => {
      if (done) return;
      if (world.mapIndex !== ENUM_WORLD.WD_0LORENCIA) return;
      if (!world.terrain || !world.playerEntity?.transform) return;

      // Spawn incrementally. This avoids freezing the browser with a 65k-cell scan.
      const candidates: { x: number; z: number }[] = [];
      for (let i = 0; i < 1200; i++) {
        const x = 10 + Math.random() * 236;
        const z = 10 + Math.random() * 236;
        if (isField(world, x, z)) candidates.push({ x, z });
      }

      const created: Entity[] = [];
      for (const pos of candidates) {
        if (created.length >= MONSTER_COUNT) break;
        if (created.some(m => m.transform && d2(pos, { x: m.transform.pos.x, z: m.transform.pos.z }) < 6 * 6)) continue;

        const factory = BudgeDragon;
        const monster = world.add({
          worldIndex: ENUM_WORLD.WD_0LORENCIA,
          transform: {
            pos: new Vector3(pos.x, world.getTerrainHeight(pos.x, pos.z), pos.z),
            rot: new Vector3(0, 0, 0),
            scale: factory.OverrideScale >= 0 ? factory.OverrideScale : 1,
            posOffset: new Vector3(0.5, 0, 0.5),
          },
          modelFactory: factory,
          movement: { velocity: { x: 0, y: 0 }, running: false },
          monsterAnimation: { action: MonsterActionType.Stop1 },
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
            nextDecisionAt: world.gameTime.TotalGameTime.TotalSeconds + Math.random() * 4,
            nextPathAt: 0,
            lastTargetX: pos.x,
            lastTargetZ: pos.z,
            nextAttackAt: 0,
            attackUntil: 0,
            damageApplied: false,
          },
          monsterHealth: { current: 100, max: 100 },
          screenPosition: { x: 0, y: 0, worldOffsetZ: 2.8 },
          visibility: { state: 'hidden', lastChecked: 0 },
          attributeSystem: createAttributeSystem(),
          objectNameInWorld: 'Budge Dragon',
          interactable: true,
        });

        monster.attributeSystem?.setValue('isFemale', 0);
        monster.attributeSystem?.setValue('isFlying', 0);
        created.push(monster);
      }

      done = created.length > 0;
      console.log(`[MONSTER SPAWN FIX4] spawned ${created.length} field monsters`);
    },
  };
};
