import {
  Color3,
  CreatePlane,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

type FireSegment = {
  plane: any;
  material: StandardMaterial;
  texture: Texture;
  distance: number;
  width: number;
  height: number;
  phase: number;
};

type ActiveEffect = {
  root: TransformNode;
  meshes: any[];
  startedAt: number;
  expiresAt: number;
  kind: 'dragon-fire' | 'player-hit';
  caster?: Entity;
  target?: Entity;
  segments?: FireSegment[];
  mesh?: any;
  baseWidth?: number;
};

// Original MU fire artwork extracted from Effect/flamestani.OZJ.
// The texture is a 4-frame vertical strip. We use it as several small
// camera-facing fire/smoke pieces that stay attached to the dragon's
// mouth-to-target line. It is NOT treated as a flying projectile.
const DRAGON_FIRE_TEXTURE =
  './game-assets/Effect/dragon_fire_breath.png';

const PLAYER_HIT_TEXTURE =
  './game-assets/Effect/sword_hit_original.png';

function makeSpriteMaterial(
  name: string,
  texture: Texture
) {
  const material = new StandardMaterial(name, texture.getScene());
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.diffuseColor = Color3.White();
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = 2;
  material.alpha = 1;
  return material;
}

function getFlatDirection(caster: Entity, target: Entity) {
  if (!caster.transform || !target.transform) return null;

  const direction = new Vector3(
    target.transform.pos.x - caster.transform.pos.x,
    0,
    target.transform.pos.z - caster.transform.pos.z
  );

  if (direction.lengthSquared() < 0.0001) return null;

  direction.normalize();
  return direction;
}

/**
 * Finds a practical mouth position without requiring a new monster bone API.
 *
 * The Budge Dragon model's Babylon hierarchy gives us a world-space bounding
 * box. We use its upper body/head region and move a short distance forward.
 * This is much more accurate than the old fixed y=0.72 position, which caused
 * the fire to appear at the monster's feet.
 */
function getDragonMouthPosition(
  caster: Entity,
  direction: Vector3
) {
  const fallback = new Vector3(
    caster.transform!.pos.x + direction.x * 0.48,
    caster.transform!.pos.y + 1.05,
    caster.transform!.pos.z + direction.z * 0.48
  );

  const mesh = caster.modelObject?.gltf?.mesh as any;
  if (!mesh) return fallback;

  try {
    const bounds = mesh.getHierarchyBoundingVectors?.(true);
    if (!bounds) return fallback;

    const min = bounds.min;
    const max = bounds.max;
    const height = Math.max(0.01, max.y - min.y);

    // Upper-front part of the Budge Dragon. The fire origin is intentionally
    // above the torso center so it visually exits the head/mouth area.
    const mouthY = min.y + height * 0.67;
    const forward = Math.max(0.20, height * 0.18);

    return new Vector3(
      caster.transform!.pos.x + direction.x * forward,
      mouthY,
      caster.transform!.pos.z + direction.z * forward
    );
  } catch {
    return fallback;
  }
}

export const SkillEffectSystem: ISystemFactory = world => {
  const query = world.with('skillEffectRequest');
  const active: ActiveEffect[] = [];

  let hitTexture: Texture | null = null;

  // Each fire segment gets its own Texture object because vOffset is
  // animated independently. The underlying image is still the same
  // original MU texture.
  const fireTextures: Texture[] = [];

  function getFireTexture(index: number) {
    if (!fireTextures[index]) {
      const texture = new Texture(
        DRAGON_FIRE_TEXTURE,
        world.scene,
        true,
        false
      );

      texture.hasAlpha = true;
      texture.anisotropicFilteringLevel = 2;
      texture.uScale = 1;
      texture.vScale = 0.25;
      texture.vOffset = 0;

      fireTextures[index] = texture;
    }

    return fireTextures[index];
  }

  function getHitTexture() {
    if (!hitTexture) {
      hitTexture = new Texture(
        PLAYER_HIT_TEXTURE,
        world.scene,
        true,
        false
      );
      hitTexture.hasAlpha = true;
      hitTexture.anisotropicFilteringLevel = 2;
    }

    return hitTexture;
  }

  function spawnDragonFire(
    event: NonNullable<Entity['skillEffectRequest']>
  ) {
    if (!event.caster?.transform || !event.target?.transform) return;

    const direction = getFlatDirection(
      event.caster,
      event.target
    );
    if (!direction) return;

    const mouth = getDragonMouthPosition(
      event.caster,
      direction
    );

    const target = event.target.transform.pos;
    const distance = Math.sqrt(
      (target.x - mouth.x) ** 2 +
      (target.z - mouth.z) ** 2
    );

    // The breath is deliberately short. It should look like a cone/stream
    // leaving the mouth, not like a projectile travelling across the map.
    const breathLength = Math.min(
      2.05,
      Math.max(0.75, distance * 0.82)
    );

    const root = new TransformNode(
      `muDragonBreath_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`,
      world.scene
    );
    root.setParent(world.mapParent);
    root.position.copyFrom(mouth);
    root.rotation.y = Math.atan2(
      direction.x,
      direction.z
    );

    const segments: FireSegment[] = [];
    const meshes: any[] = [];

    // Four compact pieces make one continuous breath. They overlap slightly
    // so the fire reads as smoke/flame coming out of the mouth.
    const layout = [
      { at: 0.12, width: 0.62, height: 0.30, phase: 0 },
      { at: 0.38, width: 0.58, height: 0.28, phase: 1 },
      { at: 0.64, width: 0.50, height: 0.25, phase: 2 },
      { at: 0.86, width: 0.40, height: 0.21, phase: 3 },
    ];

    layout.forEach((item, index) => {
      const texture = getFireTexture(index);
      const material = makeSpriteMaterial(
        `muDragonBreathMaterial_${Date.now()}_${index}`,
        texture
      );

      const plane = CreatePlane(
        `muDragonBreath_${Date.now()}_${index}`,
        { width: 1, height: 1 },
        world.scene
      );

      plane.setParent(root);
      plane.position.set(
        0,
        0,
        breathLength * item.at
      );
      plane.billboardMode = 7;
      plane.isPickable = false;
      plane.alwaysSelectAsActiveMesh = true;
      plane.material = material;
      plane.scaling.set(
        item.width,
        item.height,
        1
      );

      // Small variation keeps the original frame art from looking like four
      // identical cards pasted in a straight line.
      plane.rotation.z =
        (index % 2 === 0 ? -1 : 1) * 0.08;

      meshes.push(plane);
      segments.push({
        plane,
        material,
        texture,
        distance: breathLength * item.at,
        width: item.width,
        height: item.height,
        phase: item.phase,
      });
    });

    const now =
      world.gameTime.TotalGameTime.TotalSeconds;

    active.push({
      root,
      meshes,
      startedAt: now,
      expiresAt: now + 0.52,
      kind: 'dragon-fire',
      caster: event.caster,
      target: event.target,
      segments,
    });
  }

  function spawnPlayerHit(
    event: NonNullable<Entity['skillEffectRequest']>
  ) {
    if (!event.target?.transform) return;

    const p = event.target.transform.pos;
    const root = new TransformNode(
      `muSwordOriginal_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`,
      world.scene
    );
    root.setParent(world.mapParent);
    root.position.set(p.x, p.y + 0.88, p.z);

    const plane = CreatePlane(
      `muSwordOriginalHit_${Date.now()}`,
      { width: 1, height: 1 },
      world.scene
    );
    plane.setParent(root);
    plane.billboardMode = 7;
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;

    const material = makeSpriteMaterial(
      `muSwordOriginalMaterial_${Date.now()}`,
      getHitTexture()
    );
    plane.material = material;

    const scale = event.scale ?? 0.62;
    plane.scaling.set(
      0.82 * scale,
      0.82 * scale,
      1
    );
    plane.rotation.z =
      Math.random() * 0.45 - 0.225 +
      Math.PI * 0.25;

    const now =
      world.gameTime.TotalGameTime.TotalSeconds;

    active.push({
      root,
      meshes: [plane],
      mesh: plane,
      startedAt: now,
      expiresAt: now + 0.22,
      kind: 'player-hit',
      baseWidth: 0.82 * scale,
    });
  }

  function spawn(
    event: NonNullable<Entity['skillEffectRequest']>
  ) {
    if (event.modelPath === DRAGON_FIRE_TEXTURE) {
      spawnDragonFire(event);
      return;
    }

    if (event.modelPath === PLAYER_HIT_TEXTURE) {
      spawnPlayerHit(event);
    }
  }

  function dispose(effect: ActiveEffect) {
    for (const mesh of effect.meshes) {
      const material = mesh.material;
      mesh.dispose(false, false);

      if (material) {
        material.dispose();
      }
    }

    effect.root.dispose();
  }

  return {
    update: () => {
      const now =
        world.gameTime.TotalGameTime.TotalSeconds;

      for (const entity of [...query]) {
        const event = entity.skillEffectRequest;
        if (!event) continue;

        world.removeComponent(
          entity,
          'skillEffectRequest'
        );
        spawn(event);
      }

      for (let i = active.length - 1; i >= 0; i--) {
        const effect = active[i];
        const age = now - effect.startedAt;

        if (effect.kind === 'dragon-fire') {
          const caster = effect.caster;
          const target = effect.target;

          if (!caster?.transform || !target?.transform) {
            dispose(effect);
            active.splice(i, 1);
            continue;
          }

          const direction = getFlatDirection(
            caster,
            target
          );

          if (!direction) {
            dispose(effect);
            active.splice(i, 1);
            continue;
          }

          // Recalculate the mouth every frame. This makes the breath follow
          // the dragon instead of flying independently like a thrown object.
          const mouth = getDragonMouthPosition(
            caster,
            direction
          );
          effect.root.position.copyFrom(mouth);
          effect.root.rotation.y = Math.atan2(
            direction.x,
            direction.z
          );

          const fadeIn = Math.min(1, age / 0.06);
          const fadeOut =
            age > 0.40
              ? Math.max(0, 1 - (age - 0.40) / 0.12)
              : 1;

          const pulse =
            0.94 +
            Math.sin(age * 42) * 0.07;

          effect.segments?.forEach(
            (segment, index) => {
              const frame =
                (Math.floor(age / 0.10) +
                  segment.phase) % 4;

              segment.texture.vOffset =
                frame * 0.25;

              segment.material.alpha =
                fadeIn * fadeOut * pulse;

              const grow =
                0.92 +
                Math.min(0.08, age * 0.18);

              segment.plane.scaling.set(
                segment.width * grow,
                segment.height * grow,
                1
              );
            }
          );
        } else {
          const t = Math.min(
            1,
            Math.max(0, age / 0.22)
          );

          const material =
            effect.mesh?.material as
              | StandardMaterial
              | undefined;

          if (material) {
            material.alpha =
              0.95 * (1 - t);
          }

          const scale =
            (effect.baseWidth ?? 0.5) *
            (0.76 + 0.30 * t);

          effect.mesh?.scaling.set(
            scale,
            scale,
            1
          );
        }

        if (now >= effect.expiresAt) {
          dispose(effect);
          active.splice(i, 1);
        }
      }
    },
  };
};
