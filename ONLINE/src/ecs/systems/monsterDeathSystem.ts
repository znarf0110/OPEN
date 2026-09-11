import type { ISystemFactory } from '../world';

export const MonsterDeathSystem: ISystemFactory = world => {
  const query = world.with(
    'monsterAI',
    'monsterHealth',
    'monsterAnimation'
  );

  return {
    update: () => {
      const now = world.gameTime.TotalGameTime.TotalSeconds;

      for (const monster of [...query]) {
        const ai = monster.monsterAI;
        if (!ai) continue;
        if (ai.state !== 'dead') continue;

        // Keep the death animation visible until it finishes.
        if (now < ai.deathUntil) continue;

        if (world.currentPointerTarget === monster) {
          world.currentPointerTarget = null;
        }

        if (monster.modelObject) {
          monster.modelObject.dispose();
        }

        world.remove(monster);
      }
    },
  };
};
