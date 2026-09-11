import { ItemsDatabase } from '../../common/itemsDatabase';
import type { ModelObject } from '../../common/modelObject';
import type { PlayerObject } from '../../common/playerObject';
import type { ISystemFactory, Item } from '../world';

async function loadPart(
  part: Item | null,
  playerObject: PlayerObject,
  socket: ModelObject
): Promise<boolean> {
  if (!part) {
    return false;
  }

  const item = ItemsDatabase.getItem(
    part.group,
    part.num
  );

  if (!item) {
    return false;
  }

  await playerObject.loadPartAsync(
    item.szModelFolder,
    socket,
    item.szModelName,
    part.lvl,
    part.isExcellent
  );

  return true;
}

export const AppearanceSystem: ISystemFactory = world => {
  const query = world.with(
    'charAppearance',
    'modelObject',
    'visibility'
  );

  // Prevent the same player's equipment from being
  // loaded multiple times while an async load is running.
  const loadingPlayers = new Set<PlayerObject>();

  return {
    update: async () => {
      for (const {
        charAppearance,
        modelObject,
        visibility,
        attributeSystem,
      } of query) {
        if (visibility.state === 'hidden') {
          continue;
        }

        if (!charAppearance.changed) {
          continue;
        }

        if (!modelObject.Ready) {
          continue;
        }

        const playerObject =
          modelObject as PlayerObject;

        // Do not start another equipment load while
        // the previous one is still loading.
        if (loadingPlayers.has(playerObject)) {
          continue;
        }

        loadingPlayers.add(playerObject);

        try {
          //
          // Load all equipment and WAIT until the
          // models have actually finished loading.
          //
          const [
            helmLoaded,
            armorLoaded,
            pantsLoaded,
            glovesLoaded,
            bootsLoaded,
            weapon1Loaded,
            weapon2Loaded,
          ] = await Promise.all([
            loadPart(
              charAppearance.helm,
              playerObject,
              playerObject.HelmMask
            ),

            loadPart(
              charAppearance.armor,
              playerObject,
              playerObject.Armor
            ),

            loadPart(
              charAppearance.pants,
              playerObject,
              playerObject.Pants
            ),

            loadPart(
              charAppearance.gloves,
              playerObject,
              playerObject.Gloves
            ),

            loadPart(
              charAppearance.boots,
              playerObject,
              playerObject.Boots
            ),

            loadPart(
              charAppearance.leftHand,
              playerObject,
              playerObject.Weapon1
            ),

            loadPart(
              charAppearance.rightHand,
              playerObject,
              playerObject.Weapon2
            ),
          ]);

          //
          // Remove equipment that isn't equipped.
          //
          if (!helmLoaded) {
            playerObject.setDefaultMask();
          }

          if (!armorLoaded) {
            await playerObject.setDefaultArmor();
          }

          if (!pantsLoaded) {
            await playerObject.setDefaultPants();
          }

          if (!glovesLoaded) {
            await playerObject.setDefaultGloves();
          }

          if (!bootsLoaded) {
            await playerObject.setDefaultBoots();
          }

          if (!weapon1Loaded) {
            playerObject.Weapon1.Unload();
          }

          if (!weapon2Loaded) {
            playerObject.Weapon2.Unload();
          }

          //
          // Update spear state after equipment has
          // actually finished loading.
          //
          if (attributeSystem) {
            let isSpearEquipped = false;

            if (charAppearance.leftHand) {
              const group =
                charAppearance.leftHand.group;

              if (group === 3) {
                isSpearEquipped = true;
              }
            }

            if (charAppearance.rightHand) {
              const group =
                charAppearance.rightHand.group;

              if (group === 3) {
                isSpearEquipped = true;
              }
            }

            attributeSystem.setValue(
              'isSpearEquipped',
              isSpearEquipped ? 1 : 0
            );
          }

          //
          // IMPORTANT:
          //
          // Only mark the appearance as processed
          // AFTER all equipment has finished loading.
          //
          charAppearance.changed = false;
        } finally {
          loadingPlayers.delete(playerObject);
        }
      }
    },
  };
};