import type { ISystemFactory } from '../world';

export const OutOfScopeSystem: ISystemFactory = world => {
  const query = world.with('objOutOfScope');

  return {
    update: () => {
      for (const entity of query) {
        /*
         * ======================================================
         * PLAYERS
         * ======================================================
         *
         * NEVER remove players because of out-of-scope events.
         */
        if ('playerAnimation' in entity) {
          /*
           * Remove only the temporary out-of-scope marker.
           */
          world.removeComponent(
            entity,
            'objOutOfScope'
          );

          /*
           * Players should always remain visible.
           */
          if (entity.visibility) {
            entity.visibility.state = 'visible';
            entity.visibility.lastChecked = 0.2;
          }

          /*
           * Absolutely nothing else happens to players.
           */
          continue;
        }

        /*
         * ======================================================
         * NON-PLAYER OBJECTS
         * ======================================================
         *
         * Monsters, NPCs, items, etc. can be removed normally.
         */
        if (entity.modelObject) {
          entity.modelObject.dispose();
        }

        entity.onDispose?.();

        world.remove(entity);
      }
    },
  };
};