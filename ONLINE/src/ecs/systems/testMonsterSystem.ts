import { BudgeDragon } from '../../common/monsters/budgeDragon';
import { MonsterActionType } from '../../common/objects/enum';
import { createAttributeSystem } from '../../libs/attributeSystem';
import { Vector3 } from '../../libs/babylon/exports';
import type { ISystemFactory } from '../world';

export const TestMonsterSystem: ISystemFactory = world => {
  let spawned = false;

  return {
    update: () => {
      /*
       * Only create ONE test monster.
       */
      if (spawned) {
        return;
      }

      /*
       * Wait until the local player actually exists.
       */
      const player = world.playerEntity;

      if (!player) {
        return;
      }

      /*
       * Wait until the player's transform exists.
       */
      if (!player.transform) {
        return;
      }

      const playerPosition = player.transform.pos;

      /*
       * Put the Budge Dragon directly beside the player.
       *
       * X + 3 means about 3 map units to the right.
       */
      const monsterPosition = new Vector3(
        playerPosition.x + 3,
        playerPosition.y,
        playerPosition.z
      );

      const modelFactory = BudgeDragon;

      const monster = world.add({
        worldIndex: world.mapIndex,

        transform: {
          pos: monsterPosition,

          rot: new Vector3(
            0,
            0,
            0
          ),

          scale:
            modelFactory.OverrideScale >= 0
              ? modelFactory.OverrideScale
              : 1,

          posOffset: new Vector3(
            0.5,
            0,
            0.5
          ),
        },

        modelFactory,

        visibility: {
          lastChecked: 0,
          state: 'visible',
        },

        movement: {
          velocity: {
            x: 0,
            y: 0,
          },

          running: false,
        },

        monsterAnimation: {
          action: MonsterActionType.Stop1,
        },

        attributeSystem:
          createAttributeSystem(),

        objectNameInWorld:
          'Test Budge Dragon',

        interactable: true,
      });

      /*
       * Monster attributes.
       */
      monster.attributeSystem?.setValue(
        'isFemale',
        0
      );

      monster.attributeSystem?.setValue(
        'isFlying',
        0
      );

      /*
       * IMPORTANT:
       *
       * Set this BEFORE returning so this system
       * never creates a second monster.
       */
      spawned = true;

      console.log(
        '[TEST MONSTER] Budge Dragon spawned',
        {
          player: {
            x: playerPosition.x,
            y: playerPosition.y,
            z: playerPosition.z,
          },

          monster: {
            x: monsterPosition.x,
            y: monsterPosition.y,
            z: monsterPosition.z,
          },
        }
      );
    },
  };
};