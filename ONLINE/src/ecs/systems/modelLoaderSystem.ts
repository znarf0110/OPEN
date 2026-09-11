import { With } from 'miniplex';
import { MapPlayerNetClassToModelClass } from '../../common/mapPlayerNetClassToModelClass';
import { getModel, loadGLTF } from '../../common/modelLoader';
import { ModelObject } from '../../common/modelObject';
import { PlayerObject } from '../../common/playerObject';
import { Entity, ISystemFactory, World } from '../world';

const v3Temp = { x: 0, y: 0, z: 0 };

/*
 * ============================================================
 * PLAYER DEBUGGING
 * ============================================================
 *
 * These variables prevent the console from being flooded
 * every frame.
 */
let lastPlayerDebug = '';
let lastPlayerCount = -1;

function createModelObject(
  world: World,
  entity: With<
    Entity,
    'modelFactory' | 'worldIndex' | 'transform'
  >
) {
  /*
   * Do not create another model if one already exists.
   */
  if (entity.modelObject) {
    return;
  }

  const transform = entity.transform;
  const modelId = entity.modelId;

  /*
   * Create the model object and immediately attach it
   * to the ECS entity.
   */
  world.addComponent(
    entity,
    'modelObject',
    new entity.modelFactory(
      world.scene,
      world.mapParent
    )
  );

  /*
   * TypeScript does not know that modelObject exists
   * after addComponent(), so use the same casting
   * approach as the original repository.
   */
  const modelObject =
    entity.modelObject as any as ModelObject;

  modelObject.WorldIndex = entity.worldIndex;

  if (modelId !== undefined) {
    modelObject.Type = modelId;
  }

  /*
   * Set initial transform.
   */
  v3Temp.x = transform.pos.x;
  v3Temp.y = transform.pos.y;
  v3Temp.z = transform.pos.z;

  modelObject.updateLocation(
    v3Temp,
    transform.scale,
    transform.rot
  );

  /*
   * Set player class before initialization.
   */
  if (
    'playerClass' in modelObject &&
    entity.attributeSystem?.hasAttribute(
      'playerNetClass'
    )
  ) {
    (
      modelObject as PlayerObject
    ).playerClass =
      MapPlayerNetClassToModelClass(
        entity.attributeSystem.getValue(
          'playerNetClass'
        )
      );
  }

  /*
   * Initialize the model.
   *
   * IMPORTANT:
   *
   * PlayerObject.init() loads player.glb itself.
   * Therefore we must not try to pass the result
   * of getModel() into ModelObject.load().
   */
  modelObject
    .init(world, entity)
    .then(() => {
      /*
       * init() may already have loaded the model.
       *
       * This is what happens for PlayerObject.
       */
      if (
        modelObject.gltf ||
        modelObject.Ready
      ) {
        return;
      }

      /*
       * Make sure the ECS entity still owns this model.
       */
      if (!entity.modelObject) {
        modelObject.dispose();
        return;
      }

      const modelFilePath =
        entity.modelFilePath;

      /*
       * ====================================================
       * GLTF MODEL
       * ====================================================
       *
       * loadGLTF() returns the structure expected by
       * ModelObject.load().
       */
      if (modelFilePath) {
        loadGLTF(
          modelFilePath,
          world
        )
          .then(gltf => {
            if (entity.modelObject) {
              const currentModel =
                entity.modelObject as any as ModelObject;

              currentModel.load(gltf);
            } else {
              modelObject.dispose();
            }
          })
          .catch(error => {
            console.error(
              '[ModelLoader] loadGLTF failed:',
              modelFilePath,
              error
            );

            if (entity.modelObject) {
              world.removeComponent(
                entity,
                'modelObject'
              );
            }

            modelObject.dispose();
          });

        return;
      }

      /*
       * ====================================================
       * MODEL ID
       * ====================================================
       *
       * getModel() returns BMD.
       *
       * The original repository's model ID loading path
       * must therefore remain untouched here.
       *
       * If init() did not load the model, there is no
       * compatible ModelObject.load(BMD) operation.
       */
      if (modelId != null) {
        getModel(modelId)
          .then(() => {
            /*
             * Do not pass BMD to ModelObject.load().
             *
             * ModelObject.load() expects GLTF data.
             */
          })
          .catch(error => {
            console.error(
              '[ModelLoader] getModel failed:',
              modelId,
              error
            );
          });
      }
    })
    .catch(error => {
      console.error(
        '[ModelLoader] init failed:',
        entity.netId,
        error
      );

      if (entity.modelObject) {
        world.removeComponent(
          entity,
          'modelObject'
        );
      }

      modelObject.dispose();
    });
}

export const ModelLoaderSystem: ISystemFactory =
  world => {
    /*
     * Normal model-loading query.
     */
    const query = world.with(
      'modelFactory',
      'worldIndex',
      'transform',
      'visibility'
    );

    /*
     * IMPORTANT:
     *
     * This query contains ALL player entities.
     *
     * We use this to determine whether the remote player
     * entity still exists after it disappears visually.
     */
    const playerQuery =
      world.with('playerAnimation');

    return {
      update: () => {
        const terrain = world.terrain;

        if (!terrain) {
          return;
        }

        const playerEntity =
          world.playerEntity;

        if (!playerEntity) {
          return;
        }

        /*
         * ====================================================
         * PLAYER DIAGNOSTIC
         * ====================================================
         *
         * This does NOT change gameplay.
         *
         * It only tells us:
         *
         * 1. How many player entities exist.
         * 2. Which one is local.
         * 3. Which ones are remote.
         * 4. Whether their model exists.
         * 5. Whether their model is ready.
         * 6. Their visibility state.
         * 7. Their network ID.
         *
         * The log only appears when something changes so
         * the console does not get flooded.
         */
        const playerDebugData =
          playerQuery.entities.map(
            entity => ({
              netId: entity.netId,

              isLocal:
                entity === world.playerEntity,

              hasModel:
                !!entity.modelObject,

              ready:
                entity.modelObject?.Ready,

              visibility:
                entity.visibility?.state,

              objOutOfScope:
                'objOutOfScope' in entity,

              position:
                entity.transform
                  ? {
                      x:
                        entity.transform.pos.x,
                      y:
                        entity.transform.pos.y,
                      z:
                        entity.transform.pos.z,
                    }
                  : undefined,
            })
          );

        const playerDebugString =
          JSON.stringify(
            playerDebugData
          );

        /*
         * Log when the number of player entities changes.
         */
        if (
          playerQuery.entities.length !==
          lastPlayerCount
        ) {
          lastPlayerCount =
            playerQuery.entities.length;

          console.log(
            '[PLAYER COUNT]',
            playerQuery.entities.length,
            playerDebugData
          );
        }

        /*
         * Log when player state changes.
         */
        if (
          playerDebugString !==
          lastPlayerDebug
        ) {
          lastPlayerDebug =
            playerDebugString;

          console.log(
            '[PLAYER STATE]',
            playerDebugData
          );
        }

        /*
         * ====================================================
         * MODEL LOADING
         * ====================================================
         */
        for (const entity of query) {
          /*
           * ====================================================
           * PLAYERS
           * ====================================================
           *
           * Player models are persistent.
           *
           * NEVER use visibility.state to dispose a player.
           *
           * This is critical for remote players.
           */
          if ('playerAnimation' in entity) {
  console.log('[PLAYER MODEL]', {
    isLocal:
      entity === world.playerEntity,

    netId:
      entity.netId,

    hasModel:
      !!entity.modelObject,

    ready:
      entity.modelObject?.Ready,

    visibility:
      entity.visibility?.state,

    modelObject:
      entity.modelObject,
  });

  /*
   * Make absolutely sure players remain visible.
   */
  if (entity.visibility) {
    entity.visibility.state =
      'visible';

    entity.visibility.lastChecked =
      0.2;
  }

  /*
   * If the player entity exists but its model
   * is missing, recreate it.
   */
  if (!entity.modelObject) {
    createModelObject(
      world,
      entity
    );
  }

  continue;
}

          /*
           * ====================================================
           * NON-PLAYER OBJECTS
           * ====================================================
           *
           * Monsters, NPCs, items and other objects
           * still use the normal visibility system.
           */
          const visibility =
            entity.visibility;

          switch (
            visibility.state
          ) {
            case 'visible':
            case 'nearby': {
              if (
                !entity.modelObject
              ) {
                console.log(
                  '[ModelLoader] Creating model:',
                  entity.netId,
                  visibility.state
                );

                createModelObject(
                  world,
                  entity
                );
              }

              break;
            }

            case 'hidden': {
              if (
                entity.modelObject
              ) {
                console.log(
                  '[ModelLoader] Hiding model:',
                  entity.netId
                );

                entity.modelObject.dispose();

                world.removeComponent(
                  entity,
                  'modelObject'
                );
              }

              break;
            }
          }
        }
      },
    };
  };