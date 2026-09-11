import { Vector3 } from '../../libs/babylon/exports';
import { ISystemFactory } from '../world';

const v3Temp = Vector3.Zero();
const v3Temp2 = Vector3.Zero();

export const RenderSystem: ISystemFactory = world => {
  const query = world.with('transform', 'modelObject');

  return {
    update: () => {
      const terrain = world.terrain;
      if (!terrain) return;

      for (const entity of query) {
        const { transform, modelObject } = entity;

        /*
         * IMPORTANT:
         * Players must always be rendered.
         *
         * Distance/visibility systems may change Visible or OutOfView,
         * but a player model should not be hidden just because the
         * player is far away.
         */
        const isPlayer =
          'playerAnimation' in entity &&
          entity.playerAnimation !== undefined;

        if (isPlayer) {
          modelObject.Visible = true;
          modelObject.OutOfView = false;
        }

        modelObject.Update(world.gameTime);

        v3Temp.copyFrom(transform.rot as any);
        v3Temp.y = Math.PI * 2 - v3Temp.y;

        v3Temp2.copyFrom(transform.pos as any);

        if (transform.posOffset !== undefined) {
          v3Temp2.addInPlace(transform.posOffset as any);
        }

        modelObject.updateLocation(
          v3Temp2,
          transform.scale,
          v3Temp
        );

        if (isPlayer) {
          /*
           * Update() can potentially change the model state.
           * Force the player state again immediately before Draw().
           */
          modelObject.Visible = true;
          modelObject.OutOfView = false;
        }

        modelObject.Draw(world.gameTime);
      }
    },
  };
};