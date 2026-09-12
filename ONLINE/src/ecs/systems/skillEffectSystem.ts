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
  const fallback = () => {
    const p = caster.transform!.pos;
    return new Vector3(
      p.x + direction.x * 0.32,
      p.y + 0.95,
      p.z + direction.z * 0.32
    );
  };

  const model = caster.modelObject?.gltf?.mesh;
  if (!model) return fallback();

  /*
   * IMPORTANT:
   * Do not use a skeleton bone here.
   *
   * Monster03.glb has generic bone names (bone_0, bone_1, ...), so
   * guessing a "head-side" bone is not reliable. FIX #16 proved this
   * can select a bone near the legs.
   *
   * Instead, use the ACTUAL rendered Budge Dragon bounds only to get
   * the dragon's visible height, then place the mouth at a calibrated
   * point near the upper/front part of the rendered model.
   */
  model.computeWorldMatrix(true);

  const bounds = model.getHierarchyBoundingVectors(true);
  const min = bounds.min;
  const max = bounds.max;

  const height = Math.max(0.1, max.y - min.y);

  /*
   * Budge Dragon mouth calibration:
   * - ~76% up from the feet
   * - ~20% of model height forward from the body center
   *
   * These values are in WORLD space, so they remain correct when the
   * monster is scaled by BudgeDragon.OverrideScale.
   */
  const mouthY = min.y + height * 0.76;
  const forward = height * 0.20;

  const centerX = (min.x + max.x) * 0.5;
  const centerZ = (min.z + max.z) * 0.5;

  return new Vector3(
    centerX + direction.x * forward,
    mouthY,
    centerZ + direction.z * forward
  );
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

    /*
     * ONE plane = ONE continuous dragon breath.
     *
     * The original flamestani texture already contains the complete
     * fire-breath shape. The old implementation split it into four
     * planes, which is why four separate fireballs appeared in-game.
     */
    const breathLength = Math.min(
      2.4,
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

    const texture = getFireTexture(0);

    /*
     * The original texture is bright on its RIGHT side.
     * Flip U so the bright/fire-head side starts at the dragon's mouth
     * and the flame tapers toward the player.
     */
    texture.uScale = -1;
    texture.uOffset = 1;
    texture.vScale = 0.25;
    texture.vOffset = 0;

    const material = makeSpriteMaterial(
      `muDragonBreathMaterial_${Date.now()}`,
      texture
    );

    const plane = CreatePlane(
      `muDragonBreath_${Date.now()}`,
      { width: 1, height: 1 },
      world.scene
    );

    plane.setParent(root);
    plane.position.set(
      0,
      0,
      breathLength * 0.5
    );

    /*
     * Do NOT billboard the breath.
     * The plane is rotated by the dragon->player direction so it is
     * an actual directional stream instead of a floating screen sprite.
     */
    plane.billboardMode = 0;
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;
    plane.material = material;

    const width = breathLength;
    const height = Math.max(0.24, Math.min(0.46, breathLength * 0.22));

    plane.scaling.set(
      width,
      height,
      1
    );

    const now =
      world.gameTime.TotalGameTime.TotalSeconds;

    active.push({
      root,
      meshes: [plane],
      startedAt: now,
      expiresAt: now + 0.58,
      kind: 'dragon-fire',
      caster: event.caster,
      target: event.target,
      segments: [{
        plane,
        material,
        texture,
        distance: breathLength * 0.5,
        at: 0.5,
        width,
        height,
        phase: 0,
      }],
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

          const fadeIn = Math.min(1, age / 0.04);
          const fadeOut =
            age > 0.46
              ? Math.max(0, 1 - (age - 0.46) / 0.12)
              : 1;

          const frame =
            Math.floor(age / 0.10) % 4;

          const texture =
            effect.segments?.[0]?.texture;

          const material =
            effect.segments?.[0]?.material;

          const plane =
            effect.segments?.[0]?.plane;

          if (texture && material && plane) {
            texture.vOffset = frame * 0.25;
            material.alpha =
              fadeIn * fadeOut;

            plane.position.z =
              breathLength * 0.5;

            plane.scaling.x =
              breathLength;
          }
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
