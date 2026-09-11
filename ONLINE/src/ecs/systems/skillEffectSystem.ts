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
  at: number;
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

// VERIFIED from the supplied original MU Effect.zip:
// Effect/flamestani.OZJ is a horizontal fire-breath strip (256x256).
// The image contains four fire frames stacked vertically.
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

function rotateY(v: Vector3, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);

  return new Vector3(
    v.x * c - v.z * s,
    v.y,
    v.x * s + v.z * c
  );
}

function getVisualOrigin(caster: Entity) {
  const p = caster.transform!.pos;
  const offset = caster.transform!.posOffset;

  return new Vector3(
    p.x + (offset?.x ?? 0),
    p.y + (offset?.y ?? 0),
    p.z + (offset?.z ?? 0)
  );
}

/**
 * Find the actual animated head/mouth-side bone instead of guessing from
 * the monster bounding box.
 *
 * Monster03.glb is the Budge Dragon model. Its modelObject exposes the
 * Babylon skeleton, so the effect can use the animated bone positions.
 * This fixes the old problem where hierarchy bounds placed the fire at the
 * monster's feet because the GLB has a -Y scale + -PI/2 X conversion.
 */
function getDragonMouthPosition(
  caster: Entity,
  direction: Vector3
) {
  const transform = caster.transform!;
  const visualOrigin = getVisualOrigin(caster);
  const skeleton = caster.modelObject?.gltf?.skeleton;

  if (!skeleton || skeleton.bones.length === 0) {
    return new Vector3(
      visualOrigin.x + direction.x * 0.32,
      visualOrigin.y + 0.62,
      visualOrigin.z + direction.z * 0.32
    );
  }

  const modelYaw =
    Math.PI * 2 - (transform.rot?.y ?? 0);

  const candidates: Array<{
    boneIndex: number;
    local: Vector3;
    score: number;
  }> = [];

  const locals: Vector3[] = [];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < skeleton.bones.length; i++) {
    const node = skeleton.bones[i]?.getTransformNode();
    if (!node) continue;

    node.computeWorldMatrix(true);
    const worldPos = node.getAbsolutePosition();
    const worldRelative = worldPos.subtract(visualOrigin);
    const local = rotateY(worldRelative, -modelYaw);

    locals.push(local);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }

  const height = Math.max(0.001, maxY - minY);

  for (let i = 0; i < locals.length; i++) {
    const local = locals[i];
    const yNorm = (local.y - minY) / height;
    const horizontal = Math.hypot(local.x, local.z);

    // Mouth/head area: above the torso, but below the very top/horns.
    if (yNorm < 0.52 || yNorm > 0.90) continue;

    // The Budge Dragon's mouth is on the forward side of the head.
    // Prefer bones with positive local-Z and reject bones buried in the body.
    const forwardNorm = local.z / Math.max(0.05, height);
    const sideNorm = Math.abs(local.x) / Math.max(0.05, height);

    const yPreference =
      1 - Math.abs(yNorm - 0.70) / 0.20;

    const score =
      yPreference * 2.0 +
      forwardNorm * 4.0 -
      sideNorm * 1.2 +
      Math.min(horizontal / height, 1) * 0.15;

    candidates.push({
      boneIndex: i,
      local,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return new Vector3(
      visualOrigin.x + direction.x * 0.32,
      visualOrigin.y + 0.62,
      visualOrigin.z + direction.z * 0.32
    );
  }

  // Keep the effect just outside the mouth so the fire texture does not
  // clip through the dragon's head.
  const mouthLocal = best.local.add(
    new Vector3(0, 0.015 * height, 0.055 * height)
  );

  const mouthWorld =
    visualOrigin.add(rotateY(mouthLocal, modelYaw));

  // The selected bone is the authoritative origin. Only a very small
  // directional push is added; the old large forward offset is gone.
  mouthWorld.x += direction.x * 0.06;
  mouthWorld.z += direction.z * 0.06;

  return mouthWorld;
}

export const SkillEffectSystem: ISystemFactory = world => {
  const query = world.with('skillEffectRequest');
  const active: ActiveEffect[] = [];

  let hitTexture: Texture | null = null;
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

    const breathLength = Math.min(
      2.15,
      Math.max(0.65, distance * 0.78)
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

    // The original flamestani artwork is already a horizontal fire streak.
    // Fewer, larger pieces make it read as one breath instead of four balls.
    const layout = [
      { at: 0.05, width: 0.78, height: 0.34, phase: 0 },
      { at: 0.30, width: 0.72, height: 0.31, phase: 1 },
      { at: 0.55, width: 0.62, height: 0.27, phase: 2 },
      { at: 0.78, width: 0.50, height: 0.23, phase: 3 },
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

      meshes.push(plane);
      segments.push({
        plane,
        material,
        texture,
        distance: breathLength * item.at,
        at: item.at,
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
      expiresAt: now + 0.58,
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

          const mouth = getDragonMouthPosition(
            caster,
            direction
          );
          effect.root.position.copyFrom(mouth);
          effect.root.rotation.y = Math.atan2(
            direction.x,
            direction.z
          );

          const targetPos = target.transform.pos;
          const distance = Math.sqrt(
            (targetPos.x - mouth.x) ** 2 +
            (targetPos.z - mouth.z) ** 2
          );
          const breathLength = Math.min(
            2.15,
            Math.max(0.65, distance * 0.78)
          );

          const fadeIn = Math.min(1, age / 0.05);
          const fadeOut =
            age > 0.44
              ? Math.max(0, 1 - (age - 0.44) / 0.14)
              : 1;

          const pulse =
            0.96 + Math.sin(age * 38) * 0.04;

          effect.segments?.forEach(
            segment => {
              const frame =
                (Math.floor(age / 0.095) +
                  segment.phase) % 4;

              segment.texture.vOffset =
                frame * 0.25;

              segment.material.alpha =
                fadeIn * fadeOut * pulse;

              segment.plane.position.z =
                breathLength * segment.at;
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
