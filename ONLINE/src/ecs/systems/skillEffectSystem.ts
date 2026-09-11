import {
  Quaternion,
  TransformNode,
} from '../../libs/babylon/exports';
import { loadGLTF } from '../../common/modelLoader';
import type { Entity, ISystemFactory } from '../world';

type ActiveEffect = {
  root: TransformNode;
  mesh: any;
  animationGroups: any[];
  expiresAt: number;
};

export const SkillEffectSystem: ISystemFactory = world => {
  const query = world.with('skillEffectRequest');
  const activeEffects: ActiveEffect[] = [];

  async function spawnEffect(event: Entity['skillEffectRequest']) {
    try {
      const gltf = await loadGLTF(event.modelPath, world);

      const root = new TransformNode(
        `muSkillEffect_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        world.scene
      );

      root.setParent(world.mapParent);
      root.position.set(
        event.position.x,
        event.position.y,
        event.position.z
      );

      // Effects are authored in MU/BMD orientation.
      root.rotationQuaternion = Quaternion.FromEulerAngles(
        -Math.PI / 2,
        0,
        0
      );

      root.scaling.setAll(event.scale ?? 1);

      gltf.mesh.setParent(root);
      gltf.mesh.position.setAll(0);
      gltf.mesh.scaling.set(1, -1, 1);

      for (const group of gltf.animationGroups) {
        group.stop();
        group.reset();
      }

      if (gltf.animationGroups.length > 0) {
        // Attack effects are one-shot, exactly like MU skill effects.
        gltf.animationGroups[0].play(false);
      }

      activeEffects.push({
        root,
        mesh: gltf.mesh,
        animationGroups: gltf.animationGroups,
        expiresAt:
          world.gameTime.TotalGameTime.TotalSeconds +
          (event.duration ?? 0.9),
      });
    } catch (error) {
      console.error(
        '[SkillEffectSystem] Failed to load effect:',
        event.modelPath,
        error
      );
    }
  }

  function disposeEffect(effect: ActiveEffect) {
    for (const group of effect.animationGroups) {
      group.stop();
      group.dispose();
    }

    effect.mesh.dispose(false, true);
    effect.root.dispose();
  }

  return {
    update: () => {
      const now = world.gameTime.TotalGameTime.TotalSeconds;

      for (const entity of [...query]) {
        const event = entity.skillEffectRequest;
        if (!event) continue;

        // One request = one visual effect.
        world.removeComponent(entity, 'skillEffectRequest');
        void spawnEffect(event);
      }

      for (let i = activeEffects.length - 1; i >= 0; i--) {
        const effect = activeEffects[i];

        const animationFinished =
          effect.animationGroups.length > 0 &&
          effect.animationGroups.every(group => !group.isPlaying);

        if (now >= effect.expiresAt || animationFinished) {
          disposeEffect(effect);
          activeEffects.splice(i, 1);
        }
      }
    },
  };
};
