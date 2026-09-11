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

  async function spawnEffect(
    event: NonNullable<Entity['skillEffectRequest']>
  ) {
    try {
      console.log(
        '[SkillEffectSystem] loading',
        event.modelPath
      );

      const gltf =
        await loadGLTF(
          event.modelPath,
          world
        );

      if (!gltf.mesh) {
        console.warn(
          '[SkillEffectSystem] no mesh',
          event.modelPath
        );
        return;
      }

      const root =
        new TransformNode(
          `muSkillEffect_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`,
          world.scene
        );

      root.setParent(
        world.mapParent
      );

      root.position.set(
        event.position.x,
        event.position.y,
        event.position.z
      );

      // MU BMD/GLB effect orientation.
      root.rotationQuaternion =
        Quaternion.FromEulerAngles(
          -Math.PI / 2,
          0,
          0
        );

      root.scaling.setAll(
        event.scale ?? 1
      );

      gltf.mesh.setParent(root);
      gltf.mesh.position.setAll(0);
      gltf.mesh.scaling.set(
        1,
        -1,
        1
      );

      gltf.mesh.isVisible = true;
      gltf.mesh.isPickable = false;
      gltf.mesh.alwaysSelectAsActiveMesh =
        true;

      for (const mesh of gltf.mesh.getChildMeshes(true)) {
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh =
          true;
      }

      for (
        const group of
        gltf.animationGroups
      ) {
        group.stop();
        group.reset();
      }

      if (
        gltf.animationGroups.length > 0
      ) {
        // One-shot MU effect.
        for (
          const group of
          gltf.animationGroups
        ) {
          group.speedRatio = 1;
        }

        gltf.animationGroups[0].play(false);
      }

      activeEffects.push({
        root,
        mesh: gltf.mesh,
        animationGroups:
          gltf.animationGroups,
        expiresAt:
          world.gameTime.TotalGameTime.TotalSeconds +
          (event.duration ?? 0.8),
      });
    } catch (error) {
      console.error(
        '[SkillEffectSystem] Failed to load:',
        event.modelPath,
        error
      );
    }
  }

  function disposeEffect(
    effect: ActiveEffect
  ) {
    for (
      const group of
      effect.animationGroups
    ) {
      group.stop();
      group.dispose();
    }

    effect.mesh.dispose(
      false,
      true
    );

    effect.root.dispose();
  }

  return {
    update: () => {
      const now =
        world.gameTime.TotalGameTime.TotalSeconds;

      for (
        const entity of [...query]
      ) {
        const event =
          entity.skillEffectRequest;

        if (!event) continue;

        world.removeComponent(
          entity,
          'skillEffectRequest'
        );

        void spawnEffect(event);
      }

      for (
        let i = activeEffects.length - 1;
        i >= 0;
        i--
      ) {
        const effect =
          activeEffects[i];

        const animationFinished =
          effect.animationGroups.length >
            0 &&
          effect.animationGroups.every(
            group => !group.isPlaying
          );

        if (
          now >= effect.expiresAt ||
          animationFinished
        ) {
          disposeEffect(effect);
          activeEffects.splice(i, 1);
        }
      }
    },
  };
};
