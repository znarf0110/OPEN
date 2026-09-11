import {
  Matrix,
  Quaternion,
  Vector3,
  BoundingBox,
  Mesh,
  type StandardMaterial,
  TransformNode,
  type Scene,
  AbstractMesh,
  Skeleton,
  AnimationGroup,
} from '../libs/babylon/exports';

import type { IVector3Like } from '../libs/babylon/exports';

// import { createMeshesForBMD } from './BMD/createMeshes';

import type { Entity, World } from '../ecs/world';
import { ENUM_WORLD } from './types';
import { loadGLTF } from './modelLoader';
import { Store } from '../store';

type Int = number;

const EmptyBone = Matrix.Identity();
const EmptyMatrix = Matrix.Identity();
const tmpMatrix = Matrix.Identity();
const tmpQ = Quaternion.Identity();
const tmpVec3 = Vector3.Zero();
const tmpVec32 = Vector3.Zero();

const minTmp = new Vector3(Number.MAX_VALUE);
const maxTmp = new Vector3(Number.MIN_VALUE);

export class ModelObject {
  static OverrideScale = -1;

  Type: number = -1;
  WorldIndex: ENUM_WORLD = ENUM_WORLD.WD_0LORENCIA;

  HiddenMesh = -1;
  BlendMesh = -1;

  AnimationSpeed = 4;
  BodyHeight: Float = 0;

  CurrentAction: Int = -1;

  LoopAction = true;
  LinkParent = false;

  ActionIterationWasFinished = false;

  Ready = false;
  OutOfView = false;
  Visible = true;

  Parent?: ModelObject;
  Children: ModelObject[] = [];

  SkipBoundingBox = false;

  BoundingBoxLocal = new BoundingBox(
    Vector3.Zero(),
    Vector3.Zero()
  );

  Light = new Vector3(0, 0, 0);

  ParentBoneLink = -1;

  private _node: TransformNode;

  gltf: {
    mesh: AbstractMesh;
    skeleton: Skeleton;
    animationGroups: AnimationGroup[];
  } | null = null;

  NodeNamePrefix = '';

  get objectDir() {
    return `Object${this.WorldIndex + 1}/`;
  }

  constructor(
    private readonly scene: Scene,
    private readonly parent?: TransformNode
  ) {
    this._node = new TransformNode(
      'modelObject',
      this.scene
    );

    this._node.rotationQuaternion = null;

    if (parent) {
      this._node.setParent(parent);
    }
  }

  init(
    _world: World,
    _entity: Entity
  ): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Play a model animation.
   *
   * IMPORTANT:
   * CurrentAction alone is not enough to determine whether
   * an animation is actually running.
   *
   * Babylon can have an animation group stopped/reset while
   * CurrentAction still contains the same action index.
   */
  playAction(
    actionIndex: number,
    loop: boolean = true
  ) {
    if (!this.gltf) {
      return;
    }

    const animationGroups =
      this.gltf.animationGroups;

    const animationGroup =
      animationGroups[actionIndex];

    if (!animationGroup) {
      console.warn(
        `[ModelObject] Animation ${actionIndex} does not exist for ${this._node.name}`
      );
      return;
    }

    /*
     * Stop every other animation.
     *
     * This guarantees that only the requested player animation
     * controls the player skeleton.
     */
    for (
      let i = 0;
      i < animationGroups.length;
      i++
    ) {
      if (i === actionIndex) {
        continue;
      }

      const group = animationGroups[i];

      if (group.isPlaying) {
        group.stop();
      }
    }

    this.CurrentAction = actionIndex;
    this.LoopAction = loop;

    animationGroup.speedRatio =
      this.AnimationSpeed / 14;

    /*
     * The important part:
     *
     * If the same action was requested again but Babylon stopped
     * the group during loading, start it again.
     */
    if (!animationGroup.isPlaying) {
      animationGroup.reset();
      animationGroup.play(loop);
    }
  }

  load(gltf: {
    mesh: AbstractMesh;
    skeleton: Skeleton;
    animationGroups: AnimationGroup[];
  }) {
    if (this.gltf === gltf) {
      return;
    }

    const oldGltf = this.gltf;

    this.gltf = gltf;

    this._node.name =
      this.NodeNamePrefix +
      gltf.mesh.name;

    if (
      oldGltf &&
      oldGltf !== gltf
    ) {
      oldGltf.mesh.dispose();
    }

    /*
     * Put the loaded GLB underneath this ModelObject.
     */
    gltf.mesh.setParent(
      this._node
    );

    gltf.mesh.position.setAll(0);

    gltf.mesh.scaling.set(
      1,
      -1,
      1
    );

    gltf.mesh.rotationQuaternion =
      Quaternion.FromEulerAngles(
        -Math.PI / 2,
        0,
        0
      );

    /*
     * Equipment that uses LinkParent shares the player's
     * skeleton.
     *
     * Weapons and wings have LinkParent=false because they
     * are attached to specific player bones instead.
     */
    if (this.LinkParent) {
      const parent = this.Parent;

      if (parent) {
        const parentSkeleton =
          parent.gltf?.skeleton;

        if (parentSkeleton) {
          this.gltf.mesh
            .getChildMeshes(true)
            .forEach(mesh => {
              if (mesh.skeleton) {
                mesh.skeleton.dispose();
              }

              mesh.skeleton =
                parentSkeleton;
            });
        }
      }
    }

    /*
     * Do NOT stop animation groups here.
     *
     * The player animation system owns animation playback.
     * Stopping animation groups during GLB loading can leave
     * the player or attached objects in their initial pose.
     */
    gltf.animationGroups.forEach(
      group => {
        group.speedRatio =
          this.AnimationSpeed / 14;
      }
    );

    gltf.mesh
      .getChildMeshes(false)
      .forEach(mesh => {
        mesh.metadata ??= {};

        mesh.metadata.SkipBoundingBox =
          this.SkipBoundingBox;
      });

    this.Ready = true;
  }

  setParent(
    parent: ModelObject
  ): void {
    if (this.Parent) {
      const index =
        this.Parent.Children.indexOf(
          this
        );

      if (index !== -1) {
        this.Parent.Children.splice(
          index,
          1
        );
      }
    }

    this.Parent = parent;

    parent.Children.push(this);
  }

  getMesh(ind: number) {
    return this.gltf
      ?.mesh
      .getChildMeshes(false)[ind];
  }

  getMaterial(ind: number) {
    return this.getMesh(ind)!
      .material as StandardMaterial;
  }

  getMeshes(
    recursiveWithChildren = false
  ): Mesh[] {
    if (!this.gltf) {
      return [];
    }

    return this.gltf
      .mesh
      .getChildMeshes(
        !recursiveWithChildren
      );
  }

  setActionSpeed(
    _actionType: number,
    _speed: number
  ) {
    // Reserved for future action-specific speed.
  }

    Update(
    _gameTime: World['gameTime']
  ): void {
    if (
      !this.Ready ||
      this.OutOfView
    ) {
      return;
    }

    this.ActionIterationWasFinished =
      false;

    /*
     * Weapons and wings are attached to the
     * TransformNode linked to the player's bone.
     *
     * For glTF models, this is preferable to
     * attachToBone() because the animations target
     * these linked TransformNodes.
     */
    if (this.ParentBoneLink >= 0) {
      const parent = this.Parent;

      if (
        parent &&
        parent.gltf?.skeleton
      ) {
        const boneIndex =
          this.ParentBoneLink + 1;

        const bones =
          parent.gltf.skeleton.bones;

        const bone =
          bones[boneIndex];

        if (bone) {
          const boneNode =
            bone.getTransformNode();

          if (boneNode) {
            /*
             * The weapon/wings ModelObject should be
             * a child of the TransformNode linked to
             * the player's animated bone.
             */
            if (this._node.parent !== boneNode) {
              this._node.setParent(
                boneNode
              );
            }

            /*
             * Local offset from the hand/back bone.
             */
            this._node.position.setAll(0);

            this._node.rotationQuaternion =
              Quaternion.FromEulerAngles(
                Math.PI * 1.5,
                0,
                0
              );
          }
        }
      }
    }
  }
  

  Draw(
    _gameTime: World['gameTime']
  ): void {
    if (!this.Visible) {
      return;
    }

    this.getMeshes().forEach(
      (_, i) => {
        this.DrawMesh(i);
      }
    );
  }

  DrawMesh(
    mesh: Int
  ): void {
    if (this.HiddenMesh === mesh) {
      return;
    }
  }

  UpdateBoundings() {
    if (!this.gltf) {
      return;
    }

    this._node
      .getChildMeshes(false)
      .forEach(mesh => {
        mesh.refreshBoundingInfo(
          true,
          false
        );
      });

    const boundingBox =
      this._node.getHierarchyBoundingVectors(
        true,
        m => {
          return !m.metadata
            ?.SkipBoundingBox;
        }
      );

    this.BoundingBoxLocal
      .minimumWorld
      .copyFrom(
        boundingBox.min
      );

    this.BoundingBoxLocal
      .maximumWorld
      .copyFrom(
        boundingBox.max
      );
  }

  updateLocation(
    pos: IVector3Like,
    scale: Float,
    angles: IVector3Like
  ) {
    this._node.position.set(
      pos.x,
      pos.y,
      pos.z
    );

    this._node.rotation.x =
      angles.x;

    this._node.rotation.y =
      angles.y;

    this._node.rotation.z =
      angles.z;

    this._node.scaling.setAll(
      scale
    );
  }

  Unload() {
    this.Ready = false;
  }

  dispose(): void {
    this._node.dispose();

    if (this.gltf) {
      this.gltf.mesh.dispose(
        false,
        true
      );

      this.gltf.skeleton?.dispose();

      this.gltf.animationGroups.forEach(
        group => {
          group.dispose();
        }
      );

      this.gltf = null;
    }

    this.Ready = false;

    for (
      const child of this.Children
    ) {
      child.dispose();
    }

    this.Children.length = 0;
  }

  protected async loadSpecificModel(
    modelName: string
  ) {
    this.load(
      await loadGLTF(
        `${this.objectDir}${modelName}`,
        Store.world!
      )
    );
  }

  protected async loadSpecificModelWithDynamicID(
    modelId: number,
    namePrefix: string
  ) {
    const idx =
      (
        this.Type -
        modelId +
        1
      )
        .toString()
        .padStart(2, '0');

    const name =
      `${namePrefix}${idx}.glb`;

    await this.loadSpecificModel(
      name
    );
  }
}