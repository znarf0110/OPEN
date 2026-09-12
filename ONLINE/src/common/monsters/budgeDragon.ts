import { World } from '../../ecs/world';
import { loadGLTF } from '../modelLoader';
import { MonsterObject } from '../monsterObject';
import { MonsterActionType } from '../objects/enum';

// [NpcInfo(2, "Budge Dragon")]
export class BudgeDragon extends MonsterObject {
  static {
    // FIX #18: Budge Dragon was visually too low/small compared with the
    // player. Keep its feet on the terrain, but make the dragon itself tall
    // enough that the head/mouth sits naturally around player height.
    BudgeDragon.OverrideScale = 0.50;
  }

  async init(world: World) {
    this.load(await loadGLTF('Monster/Monster03.glb', world));

    this.setActionSpeed(MonsterActionType.Walk, 0.7);
  }
}
