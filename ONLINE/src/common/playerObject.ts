import {
  BoundingBox,
  Vector3,
  type Scene,
  type TransformNode,
} from '../libs/babylon/exports';
import { ModelObject } from './modelObject';
import { PlayerClass } from './types';
import { Entity, World } from '../ecs/world';
import { PlayerAction } from './objects/enum';
import { loadGLTF } from './modelLoader';
import { Store } from '../store';

export class PlayerObject extends ModelObject {
  playerClass: PlayerClass = PlayerClass.DarkKnight;

  readonly HelmMask: ModelObject;
  readonly Helm: ModelObject;
  readonly Armor: ModelObject;
  readonly Pants: ModelObject;
  readonly Gloves: ModelObject;
  readonly Boots: ModelObject;
  readonly Weapon1: ModelObject;
  readonly Weapon2: ModelObject;
  readonly Wings: ModelObject;

  IsInteractable = false;

  constructor(
    scene: Scene,
    parent: TransformNode
  ) {
    super(scene, parent);

    this.BoundingBoxLocal = new BoundingBox(
      new Vector3(-0.4, 0, -0.4),
      new Vector3(0.4, 1.2, 0.4)
    );

    /*
     * Players are persistent objects.
     */
    this.Visible = true;
    this.OutOfView = false;

    /*
     * Do NOT force an animation here.
     *
     * AnimationSystem is responsible for selecting the
     * correct player animation after the player is spawned.
     */
    this.CurrentAction = -1;

    this.HelmMask =
      new ModelObject(
        scene,
        this._node
      );

    this.Helm =
      new ModelObject(
        scene,
        this._node
      );

    this.Armor =
      new ModelObject(
        scene,
        this._node
      );

    this.Pants =
      new ModelObject(
        scene,
        this._node
      );

    this.Gloves =
      new ModelObject(
        scene,
        this._node
      );

    this.Boots =
      new ModelObject(
        scene,
        this._node
      );

    this.Weapon1 =
      new ModelObject(
        scene,
        this._node
      );

    this.Weapon2 =
      new ModelObject(
        scene,
        this._node
      );

    this.Wings =
      new ModelObject(
        scene,
        this._node
      );

    this.HelmMask.NodeNamePrefix =
      'HelmMask_';

    this.Helm.NodeNamePrefix =
      'Helm_';

    this.Armor.NodeNamePrefix =
      'Armor_';

    this.Pants.NodeNamePrefix =
      'Pants_';

    this.Gloves.NodeNamePrefix =
      'Gloves_';

    this.Boots.NodeNamePrefix =
      'Boots_';

    this.Weapon1.NodeNamePrefix =
      'Weapon1_';

    this.Weapon2.NodeNamePrefix =
      'Weapon2_';

    this.Wings.NodeNamePrefix =
      'Wings_';

    const objs = [
      this.HelmMask,
      this.Helm,
      this.Armor,
      this.Pants,
      this.Gloves,
      this.Boots,
      this.Weapon1,
      this.Weapon2,
      this.Wings,
    ];

    objs.forEach(obj => {
      obj.setParent(this);
      obj.LinkParent = true;
    });

    /*
     * Wings are attached directly to a player bone.
     */
    this.Wings.LinkParent = false;
    this.Wings.ParentBoneLink = 47;
    this.Wings.SkipBoundingBox = true;

    this.Weapon1.SkipBoundingBox = true;
    this.Weapon2.SkipBoundingBox = true;

    this.HelmMask.SkipBoundingBox = true;
    this.Pants.SkipBoundingBox = true;
    this.Gloves.SkipBoundingBox = true;
    this.Helm.SkipBoundingBox = true;

    /*
     * Weapon1 is attached to the player's right-hand bone.
     *
     * 28 - right hand
     * 33 - right-hand weapon socket
     */
    this.Weapon1.LinkParent = false;
    this.Weapon1.ParentBoneLink = 33;

    /*
     * Weapon2 can be enabled later when the correct left-hand
     * bone/socket is confirmed.
     */
    // this.Weapon2.LinkParent = false;
    // this.Weapon2.ParentBoneLink = 36;
  }

  /*
   * ==========================================================
   * FORCE PLAYER ROOT + CHILD MESHES TO STAY ACTIVE
   * ==========================================================
   *
   * The player body GLTF has a root mesh:
   *
   *     this.gltf.mesh
   *
   * Previously we only protected child meshes.
   *
   * Babylon can still frustum-cull the root mesh when the
   * player moves far from the camera.
   *
   * Therefore we explicitly protect BOTH:
   *
   *   1. GLTF root mesh
   *   2. All child meshes
   */
  private forcePlayerMeshesVisible(): void {
    /*
     * ======================================================
     * PLAYER BODY ROOT
     * ======================================================
     */
    if (this.gltf?.mesh) {
      this.gltf.mesh.isVisible = true;
      this.gltf.mesh.alwaysSelectAsActiveMesh = true;

      /*
       * Also make sure every descendant mesh is active.
       */
      const bodyMeshes =
        this.gltf.mesh.getChildMeshes(
          true
        );

      for (const mesh of bodyMeshes) {
        mesh.isVisible = true;
        mesh.alwaysSelectAsActiveMesh = true;
      }
    }

    /*
     * ======================================================
     * PLAYER EQUIPMENT
     * ======================================================
     */
    const children = [
      this.HelmMask,
      this.Helm,
      this.Armor,
      this.Pants,
      this.Gloves,
      this.Boots,
      this.Weapon1,
      this.Weapon2,
      this.Wings,
    ];

    for (const child of children) {
      /*
       * Equipment root.
       */
      if (child.gltf?.mesh) {
        child.gltf.mesh.isVisible = true;
        child.gltf.mesh.alwaysSelectAsActiveMesh =
          true;

        /*
         * Equipment child meshes.
         */
        const meshes =
          child.gltf.mesh.getChildMeshes(
            true
          );

        for (const mesh of meshes) {
          mesh.isVisible = true;
          mesh.alwaysSelectAsActiveMesh =
            true;
        }
      }
    }
  }

  async init(
    world: World,
    entity: Entity
  ) {
    await super.init(
      world,
      entity
    );

    /*
     * Load the player body first.
     */
    this.load(
      await loadGLTF(
        'Player/player.glb',
        world
      )
    );

    /*
     * Keep the player unavailable while equipment
     * is loading.
     */
    this.Ready = false;

    /*
     * Protect the body immediately after loading.
     */
    this.forcePlayerMeshesVisible();

    await this.updateBodyPartClassesAsync();

    this.setActionSpeed(
      PlayerAction.PLAYER_WALK_MALE,
      2
    );

    this.setActionSpeed(
      PlayerAction.PLAYER_WALK_FEMALE,
      2
    );

    /*
     * Player visibility must remain enabled.
     */
    this.Visible = true;
    this.OutOfView = false;

    /*
     * Protect the body and equipment after loading.
     */
    this.forcePlayerMeshesVisible();

    this.Ready = true;
  }

  async updateBodyPartClassesAsync() {
    await this.setBodyPartsAsync(
      'Player/',
      'HelmClass',
      'ArmorClass',
      'PantClass',
      'GloveClass',
      'BootClass',
      this.playerClass
    );
  }

  async setDefaultHelm() {
    await this.setBodyPartsAsync(
      'Player/',
      'HelmClass',
      '',
      '',
      '',
      '',
      this.playerClass
    );
  }

  async setDefaultMask() {
    this.HelmMask.Unload();
  }

  async setDefaultArmor() {
    await this.setBodyPartsAsync(
      'Player/',
      '',
      'ArmorClass',
      '',
      '',
      '',
      this.playerClass
    );
  }

  async setDefaultPants() {
    await this.setBodyPartsAsync(
      'Player/',
      '',
      '',
      'PantClass',
      '',
      '',
      this.playerClass
    );
  }

  async setDefaultGloves() {
  await this.setBodyPartsAsync(
    'Player/',
    '',
    '',
    '',
    'GloveClass',
    '',
    this.playerClass
  );
}

  async setDefaultBoots() {
  await this.setBodyPartsAsync(
    'Player/',
    '',
    '',
    '',
    '',
    'BootClass',
    this.playerClass
  );
}

  async setBodyPartsAsync(
    pathPrefix: string,
    helmPrefix: string,
    armorPrefix: string,
    pantPrefix: string,
    glovePrefix: string,
    bootPrefix: string,
    skinIndex: number
  ) {
    const fileSuffix =
      skinIndex
        .toString()
        .padStart(2, '0');

    await Promise.all([
      !helmPrefix
        ? Promise.resolve()
        : this.loadPartAsync(
            pathPrefix,
            this.Helm,
            `${helmPrefix}${fileSuffix}.glb`
          ),

      !armorPrefix
        ? Promise.resolve()
        : this.loadPartAsync(
            pathPrefix,
            this.Armor,
            `${armorPrefix}${fileSuffix}.glb`
          ),

      !pantPrefix
        ? Promise.resolve()
        : this.loadPartAsync(
            pathPrefix,
            this.Pants,
            `${pantPrefix}${fileSuffix}.glb`
          ),

      !glovePrefix
        ? Promise.resolve()
        : this.loadPartAsync(
            pathPrefix,
            this.Gloves,
            `${glovePrefix}${fileSuffix}.glb`
          ),

      !bootPrefix
        ? Promise.resolve()
        : this.loadPartAsync(
            pathPrefix,
            this.Boots,
            `${bootPrefix}${fileSuffix}.glb`
          ),
    ]);
  }

  async loadPartAsync(
    dir: string,
    part: ModelObject,
    modelPath: string,
    itemLvl?: number,
    isExcellent?: boolean
  ) {
    const gltf =
      await loadGLTF(
        dir + modelPath,
        Store.world!
      );

    part.load(gltf);

    /*
     * Weapons must NOT play their own animation.
     */
    if (
      part === this.Weapon1 ||
      part === this.Weapon2
    ) {
      for (
        const animationGroup
        of gltf.animationGroups
      ) {
        animationGroup.stop();
        animationGroup.reset();
      }

      part.CurrentAction = -1;
    }

    gltf.mesh.isPickable =
      this.IsInteractable;

    /*
     * Protect equipment root mesh.
     */
    gltf.mesh.isVisible = true;
    gltf.mesh.alwaysSelectAsActiveMesh =
      true;

    const meshes =
      gltf.mesh.getChildMeshes(
        true
      );

    meshes.forEach(mesh => {
      mesh.isPickable =
        this.IsInteractable;

      mesh.metadata ??= {};

      mesh.metadata.itemLvl =
        itemLvl ?? 0;

      mesh.metadata.isExcellent =
        isExcellent ?? false;

      /*
       * Prevent frustum culling.
       */
      mesh.isVisible = true;
      mesh.alwaysSelectAsActiveMesh =
        true;
    });
  }

  Update(
    gameTime: World['gameTime']
  ): void {
    /*
     * ======================================================
     * PLAYER VISIBILITY
     * ======================================================
     */
    this.Visible = true;
    this.OutOfView = false;

    /*
     * Protect actual Babylon meshes.
     */
    this.forcePlayerMeshesVisible();

    /*
     * Update player body.
     */
    super.Update(gameTime);

    /*
     * Update equipment.
     */
    for (
      const child of this.Children
    ) {
      child.Visible = true;
      child.OutOfView = false;

      child.Update(gameTime);
    }

    /*
     * Protect meshes again after child updates.
     */
    this.forcePlayerMeshesVisible();
  }

  Draw(
    gameTime: World['gameTime']
  ): void {
    /*
     * ======================================================
     * PLAYER VISIBILITY
     * ======================================================
     */
    this.Visible = true;
    this.OutOfView = false;

    this.forcePlayerMeshesVisible();

    /*
     * Draw player body.
     */
    super.Draw(gameTime);

    /*
     * Draw equipment.
     */
    for (
      const child of this.Children
    ) {
      child.Visible = true;
      child.OutOfView = false;

      child.Draw(gameTime);
    }
  }
}