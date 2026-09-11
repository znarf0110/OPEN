import {
  Color3,
  CreateTorus,
  ParticleSystem,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

type RingFx = {
  mesh: any;
  material: StandardMaterial;
  startScale: number;
};

type FireFx = {
  root: TransformNode;
  rings: RingFx[];
  particles: ParticleSystem[];
  start: Vector3;
  end: Vector3;
  startedAt: number;
  travelDuration: number;
  expiresAt: number;
  kind: 'dragon-fire' | 'player-hit';
};

const FIRE_TEXTURE_DATA =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"%3E%3Cdefs%3E%3CradialGradient id="g" cx="50%25" cy="50%25" r="50%25"%3E%3Cstop offset="0%25" stop-color="white" stop-opacity="1"/%3E%3Cstop offset="55%25" stop-color="white" stop-opacity=".9"/%3E%3Cstop offset="100%25" stop-color="white" stop-opacity="0"/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx="32" cy="32" r="30" fill="url(%23g)"/%3E%3C/svg%3E';

function distance2D(a: Vector3, b: Vector3) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function lerp(a: Vector3, b: Vector3, t: number) {
  return new Vector3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

export const SkillEffectSystem: ISystemFactory = world => {
  const query = world.with('skillEffectRequest');
  const active: FireFx[] = [];
  let texture: Texture | null = null;

  function getFireTexture() {
    if (!texture) {
      texture = new Texture(FIRE_TEXTURE_DATA, world.scene, true, false);
    }
    return texture;
  }

  function makeMaterial(name: string, color: Color3) {
    const material = new StandardMaterial(name, world.scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(1.35);
    material.specularColor = Color3.Black();
    material.alpha = 0.95;
    material.disableLighting = true;
    return material;
  }

  function makeRing(
    root: TransformNode,
    diameter: number,
    thickness: number,
    color: Color3,
    scale: number,
    y: number
  ): RingFx {
    const material = makeMaterial(
      `muFxMat_${Math.random().toString(36).slice(2)}`,
      color
    );

    const mesh = CreateTorus(
      `muFxRing_${Math.random().toString(36).slice(2)}`,
      {
        diameter,
        thickness,
        tessellation: 32,
      },
      world.scene
    );

    mesh.setParent(root);
    mesh.position.set(0, y, 0);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.scaling.setAll(scale);

    return { mesh, material, startScale: scale };
  }

  function makeFireParticles(
    root: TransformNode,
    count: number,
    color1: Color3,
    color2: Color3,
    life: number,
    size: number,
    emitRate: number
  ) {
    const ps = new ParticleSystem(
      `muFireParticles_${Math.random().toString(36).slice(2)}`,
      count,
      world.scene
    );

    ps.particleTexture = getFireTexture();
    ps.emitter = root;
    ps.minSize = size * 0.45;
    ps.maxSize = size;
    ps.minLifeTime = life * 0.55;
    ps.maxLifeTime = life;
    ps.emitRate = emitRate;
    ps.minEmitPower = 0.15;
    ps.maxEmitPower = 0.55;
    ps.gravity = new Vector3(0, 0.25, 0);
    ps.color1 = new Color3(color1.r, color1.g, color1.b);
    ps.color2 = new Color3(color2.r, color2.g, color2.b);
    ps.colorDead = new Color3(0.08, 0.08, 0.08);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.minAngularSpeed = -3;
    ps.maxAngularSpeed = 3;
    ps.start();

    return ps;
  }

  function spawnPlayerHit(event: NonNullable<Entity['skillEffectRequest']>) {
    if (!event.target?.transform) return;

    const p = event.target.transform.pos;
    const root = new TransformNode(
      `muPlayerHit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      world.scene
    );

    root.setParent(world.mapParent);
    root.position.set(p.x, p.y + 0.95, p.z);
    root.scaling.setAll((event.scale ?? 0.72) * 1.15);

    const rings = [
      makeRing(root, 1.55, 0.085, new Color3(1, 0.78, 0.15), 0.42, 0),
      makeRing(root, 1.1, 0.06, new Color3(1, 0.28, 0.03), 0.36, 0.05),
    ];

    rings[0].mesh.rotation.z = Math.PI * 0.15;
    rings[0].mesh.rotation.y = Math.PI * 0.35;
    rings[0].mesh.scaling.set(1.55, 0.22, 0.38);

    rings[1].mesh.rotation.z = -Math.PI * 0.20;
    rings[1].mesh.rotation.y = -Math.PI * 0.25;
    rings[1].mesh.scaling.set(1.15, 0.18, 0.28);

    const particles = makeFireParticles(
      root,
      20,
      new Color3(1, 0.95, 0.45),
      new Color3(1, 0.22, 0.02),
      0.28,
      0.32,
      55
    );

    const now = world.gameTime.TotalGameTime.TotalSeconds;
    active.push({
      root,
      rings,
      particles: [particles],
      start: root.position.clone(),
      end: root.position.clone(),
      startedAt: now,
      travelDuration: 0,
      expiresAt: now + 0.42,
      kind: 'player-hit',
    });
  }

  function spawnDragonFire(event: NonNullable<Entity['skillEffectRequest']>) {
    if (!event.caster?.transform || !event.target?.transform) return;

    const caster = event.caster.transform.pos;
    const target = event.target.transform.pos;

    // Start near the dragon's chest/mouth and finish at the player's torso.
    const start = new Vector3(caster.x, caster.y + 1.05, caster.z);
    const end = new Vector3(target.x, target.y + 0.95, target.z);
    const travel = Math.min(0.52, Math.max(0.20, distance2D(start, end) * 0.075));

    const root = new TransformNode(
      `muDragonFire_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      world.scene
    );
    root.setParent(world.mapParent);

    // The root itself travels from dragon -> player. The child rings and
    // particles make the projectile look like a compact flame/smoke stream.
    const rings = [
      makeRing(root, 0.82, 0.12, new Color3(1, 0.18, 0.01), 0.55, 0),
      makeRing(root, 0.55, 0.09, new Color3(1, 0.72, 0.06), 0.48, 0.02),
      makeRing(root, 1.15, 0.10, new Color3(0.18, 0.12, 0.08), 0.28, 0.02),
    ];

    rings[0].mesh.scaling.set(0.9, 0.9, 1.6);
    rings[1].mesh.scaling.set(0.75, 0.75, 1.8);
    rings[2].mesh.scaling.set(0.95, 0.95, 0.45);

    const fire = makeFireParticles(
      root,
      36,
      new Color3(1, 0.95, 0.55),
      new Color3(1, 0.12, 0.01),
      0.35,
      0.42,
      80
    );

    const smoke = makeFireParticles(
      root,
      18,
      new Color3(0.16, 0.13, 0.10),
      new Color3(0.035, 0.03, 0.025),
      0.60,
      0.50,
      25
    );

    const now = world.gameTime.TotalGameTime.TotalSeconds;
    root.position.copyFrom(start);

    active.push({
      root,
      rings,
      particles: [fire, smoke],
      start,
      end,
      startedAt: now,
      travelDuration: travel,
      expiresAt: now + travel + 0.45,
      kind: 'dragon-fire',
    });
  }

  function spawn(event: NonNullable<Entity['skillEffectRequest']>) {
    if (event.modelPath === 'dragon-fire') {
      spawnDragonFire(event);
      return;
    }

    spawnPlayerHit(event);
  }

  function dispose(effect: FireFx) {
    for (const ring of effect.rings) {
      ring.mesh.dispose(false, false);
      ring.material.dispose();
    }

    for (const ps of effect.particles) {
      ps.stop();
      ps.dispose();
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
        spawn(event);
      }

      for (let i = active.length - 1; i >= 0; i--) {
        const effect = active[i];
        const age = now - effect.startedAt;

        if (effect.kind === 'dragon-fire') {
          const t = Math.min(1, Math.max(0, age / effect.travelDuration));
          const eased = 1 - Math.pow(1 - t, 3);
          effect.root.position.copyFrom(lerp(effect.start, effect.end, eased));

          const fade = age > effect.travelDuration
            ? Math.max(0, 1 - (age - effect.travelDuration) / 0.45)
            : 1;

          effect.root.scaling.setAll(0.85 + t * 0.28);
          effect.rings[0].material.alpha = 0.92 * fade;
          effect.rings[1].material.alpha = 0.95 * fade;
          effect.rings[2].material.alpha = 0.55 * fade;
          effect.root.rotation.z += 0.20;
          effect.root.rotation.y += 0.14;

          if (age >= effect.travelDuration) {
            // Turn the projectile into a short body-hit burst.
            effect.rings[0].mesh.scaling.set(1.5, 1.5, 1.5);
            effect.rings[1].mesh.scaling.set(1.2, 1.2, 1.2);
            effect.rings[2].mesh.scaling.set(1.6, 1.6, 1.0);
          }
        } else {
          const progress = Math.min(1, Math.max(0, age / 0.42));
          const ease = 1 - Math.pow(1 - progress, 2);
          effect.root.scaling.setAll(0.95 + ease * 0.25);
          effect.root.rotation.y += 0.28;

          for (const ring of effect.rings) {
            ring.material.alpha = 0.95 * (1 - progress);
          }
        }

        if (now >= effect.expiresAt) {
          dispose(effect);
          active.splice(i, 1);
        }
      }
    },
  };
};
