import {
  Color3,
  CreateTorus,
  StandardMaterial,
  TransformNode,
} from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

type ActiveEffect = {
  root: TransformNode;
  rings: { mesh: any; material: StandardMaterial; baseScale: number }[];
  startedAt: number;
  expiresAt: number;
};

/**
 * Lightweight MU-style hit effect.
 *
 * This intentionally does not depend on converted BMD/GLB effect assets.
 * The effect is generated directly in Babylon, so it is visible even when
 * the Effect/*.glb files have not been converted yet. It also avoids loading
 * the same effect asset repeatedly for every hit.
 */
export const SkillEffectSystem: ISystemFactory = world => {
  const query = world.with('skillEffectRequest');
  const activeEffects: ActiveEffect[] = [];

  function spawnHitEffect(event: NonNullable<Entity['skillEffectRequest']>) {
    const root = new TransformNode(
      `muHitEffect_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      world.scene
    );

    root.setParent(world.mapParent);
    root.position.set(event.position.x, event.position.y, event.position.z);
    root.scaling.setAll(event.scale ?? 0.72);

    const material = new StandardMaterial(
      `muHitEffectMaterial_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      world.scene
    );

    // Warm golden-white slash impact, close to classic MU hit feedback.
    material.diffuseColor = new Color3(1, 0.72, 0.18);
    material.emissiveColor = new Color3(1, 0.48, 0.05);
    material.specularColor = new Color3(1, 1, 1);
    material.alpha = 0.95;
    material.disableLighting = false;

    const rings: ActiveEffect['rings'] = [];

    // Two thin rings give a fast impact pulse without creating a heavy
    // particle system for every normal attack.
    for (let i = 0; i < 2; i++) {
      const ring = CreateTorus(
        `muHitRing_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
        {
          diameter: i === 0 ? 1.15 : 0.72,
          thickness: i === 0 ? 0.075 : 0.055,
          tessellation: 24,
        },
        world.scene
      );

      ring.setParent(root);
      ring.position.set(0, i === 0 ? 0.05 : 0.18, 0);
      ring.rotation.x = Math.PI / 2;
      ring.material = material;
      ring.isPickable = false;
      ring.alwaysSelectAsActiveMesh = true;
      ring.scaling.setAll(0.45 + i * 0.12);

      rings.push({
        mesh: ring,
        material,
        baseScale: 0.45 + i * 0.12,
      });
    }

    const now = world.gameTime.TotalGameTime.TotalSeconds;
    activeEffects.push({
      root,
      rings,
      startedAt: now,
      expiresAt: now + Math.min(event.duration ?? 0.45, 0.65),
    });
  }

  function disposeEffect(effect: ActiveEffect) {
    for (const item of effect.rings) {
      item.mesh.dispose(false, false);
    }

    // This material belongs only to this effect.
    if (!effect.rings.some(item => item.material !== effect.rings[0]?.material)) {
      effect.rings[0]?.material.dispose();
    }

    effect.root.dispose();
  }

  return {
    update: () => {
      const now = world.gameTime.TotalGameTime.TotalSeconds;

      for (const entity of [...query]) {
        const event = entity.skillEffectRequest;
        if (!event) continue;

        world.removeComponent(entity, 'skillEffectRequest');
        spawnHitEffect(event);
      }

      for (let i = activeEffects.length - 1; i >= 0; i--) {
        const effect = activeEffects[i];
        const duration = Math.max(0.01, effect.expiresAt - effect.startedAt);
        const progress = Math.min(1, Math.max(0, (now - effect.startedAt) / duration));

        // Smooth pulse: fast expansion followed by a soft fade.
        const ease = 1 - Math.pow(1 - progress, 2);
        const alpha = 0.95 * (1 - progress);

        effect.root.rotation.y += 0.22;
        effect.root.rotation.x += 0.04;

        for (const item of effect.rings) {
          const scale = item.baseScale * (0.85 + ease * 1.7);
          item.mesh.scaling.setAll(scale);
          item.material.alpha = alpha;
        }

        if (now >= effect.expiresAt) {
          disposeEffect(effect);
          activeEffects.splice(i, 1);
        }
      }
    },
  };
};
