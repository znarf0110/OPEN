import {
  Matrix,
  PointerEventTypes,
  Vector3,
} from '../../libs/babylon/exports';
import type { Entity, ISystemFactory } from '../world';

type DamageNumber = {
  entity: Entity;
  amount: number;
  born: number;
  element: HTMLDivElement;
};

export const MonsterTargetUISystem: ISystemFactory = world => {
  const root = document.createElement('div');

  root.style.position = 'fixed';
  root.style.left = '0';
  root.style.top = '0';
  root.style.width = '100%';
  root.style.height = '100%';
  root.style.zIndex = '9999';
  root.style.pointerEvents = 'none';

  document.body.appendChild(root);

  /*
   * ==========================================================
   * MONSTER NAME
   * ==========================================================
   *
   * HP value is intentionally NOT shown in the name.
   *
   * Example:
   *     Budge Dragon
   */

  const name = document.createElement('div');

  name.style.position = 'absolute';
  name.style.width = '130px';
  name.style.marginLeft = '-65px';
  name.style.textAlign = 'center';
  name.style.font = 'bold 11px Arial';
  name.style.color = '#fff';
  name.style.textShadow = '1px 1px 3px #000';
  name.style.whiteSpace = 'nowrap';
  name.style.display = 'none';

  /*
   * ==========================================================
   * SMALL HP BAR
   * ==========================================================
   */

  const frame = document.createElement('div');

  frame.style.position = 'absolute';
  frame.style.width = '72px';
  frame.style.height = '6px';
  frame.style.marginLeft = '-36px';
  frame.style.border = '1px solid #111';
  frame.style.background = '#222';
  frame.style.boxSizing = 'border-box';
  frame.style.display = 'none';

  const fill = document.createElement('div');

  fill.style.height = '100%';
  fill.style.width = '100%';
  fill.style.background = '#e11';

  frame.appendChild(fill);

  root.appendChild(name);
  root.appendChild(frame);

  let selected: Entity | null = null;

  const damageNumbers: DamageNumber[] = [];

  /*
   * ==========================================================
   * TARGET SELECTION
   * ==========================================================
   */

  world.scene.onPointerObservable.add(ev => {
    if (ev.type !== PointerEventTypes.POINTERDOWN) {
      return;
    }

    const target = world.currentPointerTarget;

    if (target?.monsterHealth) {
      selected = target;
    } else {
      selected = null;
    }
  });

  function hideTargetUI() {
    name.style.display = 'none';
    frame.style.display = 'none';
  }

  /*
   * ==========================================================
   * GET VISUAL MODEL ANCHOR
   * ==========================================================
   *
   * IMPORTANT:
   *
   * transform.pos is the MODEL ROOT position.
   * Some monsters have a visual mesh whose center is offset
   * from that root.
   *
   * We therefore use the actual ModelObject bounding box
   * when it is available.
   *
   * This keeps the HP bar above the MONSTER MODEL instead
   * of accidentally appearing above the player.
   */

  function getEntityAnchor(
    entity: Entity,
    fallbackHeight: number
  ): Vector3 | null {
    if (!entity.transform) {
      return null;
    }

    const position = entity.transform.pos;

    const model = entity.modelObject;

    if (model?.Ready) {
      const min = model.BoundingBoxLocal.minimumWorld;
      const max = model.BoundingBoxLocal.maximumWorld;

      /*
       * Use the visual model's center X/Z and top Y.
       */
      if (
        Number.isFinite(min.x) &&
        Number.isFinite(min.y) &&
        Number.isFinite(min.z) &&
        Number.isFinite(max.x) &&
        Number.isFinite(max.y) &&
        Number.isFinite(max.z) &&
        max.y > min.y
      ) {
        return new Vector3(
          (min.x + max.x) * 0.5,
          max.y + 0.15,
          (min.z + max.z) * 0.5
        );
      }
    }

    /*
     * Fallback for models whose bounding box is not ready.
     */
    return new Vector3(
      position.x,
      position.y + fallbackHeight,
      position.z
    );
  }

  /*
   * ==========================================================
   * WORLD -> SCREEN
   * ==========================================================
   */

  function projectEntity(
    entity: Entity,
    fallbackHeight: number
  ) {
    const camera = world.scene.activeCamera;

    if (!camera) {
      return null;
    }

    const engine = world.scene.getEngine();

    const viewport = camera.viewport.toGlobal(
      engine.getRenderWidth(),
      engine.getRenderHeight()
    );

    const worldPosition = getEntityAnchor(
      entity,
      fallbackHeight
    );

    if (!worldPosition) {
      return null;
    }

    const projected = Vector3.Project(
      worldPosition,
      Matrix.Identity(),
      world.scene.getTransformMatrix(),
      viewport
    );

    /*
     * Babylon Project() already returns TOP-LEFT screen Y.
     *
     * DO NOT invert Y here.
     */

    return {
      x: projected.x,
      y: projected.y,
      z: projected.z,
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
    };
  }

  return {
    update: () => {
      /*
       * ========================================================
       * MONSTER HP BAR
       * ========================================================
       */

      const monsterEntities =
        world.with('monsterHealth').entities;

      const target =
        selected ??
        world.currentPointerTarget;

      if (
        !target ||
        !monsterEntities.includes(target) ||
        !target.monsterHealth ||
        !target.transform ||
        target.visibility?.state === 'hidden' ||
        target.monsterAI?.state === 'dead' ||
        target.monsterHealth.current <= 0
      ) {
        hideTargetUI();

        if (
          selected &&
          !monsterEntities.includes(selected)
        ) {
          selected = null;
        }
      } else {
        const hp = target.monsterHealth;

        const maxHp =
          Math.max(1, hp.max);

        const currentHp =
          Math.max(
            0,
            Math.min(
              maxHp,
              hp.current
            )
          );

        const percent =
          (currentHp / maxHp) * 100;

        const projected =
          projectEntity(
            target,
            target.screenPosition?.worldOffsetZ ?? 2.8
          );

        if (!projected) {
          hideTargetUI();
        } else {
          const visible =
            projected.z >= 0 &&
            projected.z <= 1 &&
            projected.x >= 0 &&
            projected.x <= projected.width &&
            projected.y >= 0 &&
            projected.y <= projected.height;

          if (!visible) {
            hideTargetUI();
          } else {
            name.style.display = 'block';
            frame.style.display = 'block';

            /*
             * NAME ABOVE BAR
             */
            name.style.left =
              `${projected.x}px`;

            name.style.top =
              `${projected.y - 27}px`;

            /*
             * SMALL HP BAR DIRECTLY BELOW NAME
             */
            frame.style.left =
              `${projected.x}px`;

            frame.style.top =
              `${projected.y - 13}px`;

            /*
             * ONLY MONSTER NAME.
             *
             * No 40/100, 90/100, etc.
             */
            name.textContent =
              target.objectNameInWorld ||
              'Monster';

            fill.style.width =
              `${percent}%`;
          }
        }
      }

      /*
       * ========================================================
       * CREATE DAMAGE NUMBERS
       * ========================================================
       */

      for (
        const entity of world.with('damageNumber').entities
      ) {
        const event =
          entity.damageNumber;

        if (
          !event ||
          !entity.transform ||
          !world.scene.activeCamera
        ) {
          if (entity.damageNumber) {
            world.removeComponent(
              entity,
              'damageNumber'
            );
          }

          continue;
        }

        const element =
          document.createElement('div');

        element.textContent =
          `-${Math.abs(event.amount)}`;

        element.style.position = 'fixed';
        element.style.font =
          'bold 16px Arial';
        element.style.color = '#fff';
        element.style.textShadow =
          '1px 1px 3px #000';
        element.style.pointerEvents =
          'none';
        element.style.zIndex =
          '10000';
        element.style.whiteSpace =
          'nowrap';

        document.body.appendChild(
          element
        );

        damageNumbers.push({
          entity,
          amount: event.amount,
          born: event.time,
          element,
        });

        world.removeComponent(
          entity,
          'damageNumber'
        );
      }

      /*
       * ========================================================
       * UPDATE DAMAGE NUMBERS
       * ========================================================
       */

      const now =
        world.gameTime.TotalGameTime.TotalSeconds;

      for (
        let i = damageNumbers.length - 1;
        i >= 0;
        i--
      ) {
        const d =
          damageNumbers[i];

        const age =
          now - d.born;

        if (
          age > 0.8 ||
          !d.entity.transform
        ) {
          d.element.remove();
          damageNumbers.splice(i, 1);
          continue;
        }

        const projected =
          projectEntity(
            d.entity,
            d.entity.monsterHealth
              ? 2.8
              : 2.2
          );

        if (!projected) {
          d.element.remove();
          damageNumbers.splice(i, 1);
          continue;
        }

        /*
         * Damage number starts directly above
         * the actual visual model.
         */
        const x =
          projected.x;

        const y =
          projected.y -
          age * 35;

        d.element.style.left =
          `${x - 8}px`;

        d.element.style.top =
          `${y - 16}px`;

        d.element.style.opacity =
          `${Math.max(
            0,
            1 - age / 0.8
          )}`;
      }
    },
  };
};
