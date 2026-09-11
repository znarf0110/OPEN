import { TransformNode } from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

type ActiveEffect = {
  root: TransformNode;
  animationGroups: any[];
  expiresAt: number;
};

export const SkillEffectSystem: ISystemFactory = world => {
  const query = world.with('skillEffectRequest');
  const active: ActiveEffect[] = [];

  function spawn(request: NonNullable<Entity['skillEffectRequest']>) {
    const fileName = request.modelPath.split('/').at(-1)!;

    const task = world.assetsManager.addMeshTask(
      `mu-skill-effect-${fileName}-${Date.now()}`,
      undefined,
      request.modelPath,
      ''
    );

    task.onSuccess = () => {
      const root = new TransformNode(
        `mu-skill-effect-root-${Date.now()}`,
        world.scene
      );

      for (const mesh of task.loadedMeshes) {
        mesh.parent = root;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
      }

      root.position.set(
        request.position.x,
        request.position.y,
        request.position.z
      );
      root.scaling.setAll(request.scale);

      for (const group of task.loadedAnimationGroups) {
        group.reset();
        group.play(false);
      }

      const now = world.gameTime.TotalGameTime.TotalSeconds;

      active.push({
        root,
        animationGroups: task.loadedAnimationGroups,
        expiresAt: now + request.duration,
      });
    };

    task.onError = (_task, message, exception) => {
      console.error(
        `[SkillEffectSystem] Could not load ${request.modelPath}`,
        message,
        exception
      );
    };

    task.run(world.scene);
  }

  return {
    update: () => {
      const now = world.gameTime.TotalGameTime.TotalSeconds;

      for (const entity of [...query]) {
        const request = entity.skillEffectRequest;
        if (!request) continue;

        world.removeComponent(entity, 'skillEffectRequest');
        spawn(request);
      }

      for (let i = active.length - 1; i >= 0; i--) {
        const effect = active[i];

        if (now < effect.expiresAt) continue;

        effect.root.dispose();
        active.splice(i, 1);
      }
    },
  };
};
