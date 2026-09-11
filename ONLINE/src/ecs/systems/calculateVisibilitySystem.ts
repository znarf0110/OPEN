import type { ISystemFactory } from '../world';

// Larger ranges make the larger test population easier to see in Lorencia.
// ModelLoaderSystem still unloads hidden models, so this is intentionally
// not an unlimited range.
const VISIBLE_RANGE = 40;
const NEARBY_RANGE = 52;

export const CalculateVisibilitySystem: ISystemFactory = world => {
  const query = world.with('transform', 'visibility');

  return {
    update: dt => {
      const playerEntity = world.playerEntity;
      if (!playerEntity) return;

      const terrain = world.terrain;
      if (!terrain) return;

      for (const entity of query) {
        const visibility = entity.visibility;

        visibility.lastChecked -= dt;

        if (visibility.lastChecked > 0) continue;

        // Lured monsters must stay rendered while chasing the player.
        if (
          entity.monsterAI?.lured &&
          entity.worldIndex === world.mapIndex
        ) {
          visibility.state = 'visible';
          visibility.lastChecked = 0.2;
          continue;
        }

        const dx =
          entity.transform.pos.x -
          playerEntity.transform.pos.x;
        const dz =
          entity.transform.pos.z -
          playerEntity.transform.pos.z;

        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= VISIBLE_RANGE) {
          visibility.state = 'visible';
          visibility.lastChecked = 0.2;
        } else if (distance <= NEARBY_RANGE) {
          visibility.state = 'nearby';
          visibility.lastChecked = 0.3;
        } else {
          visibility.state = 'hidden';
          visibility.lastChecked = 1;
        }
      }
    },
  };
};
