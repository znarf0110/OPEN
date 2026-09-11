import { World } from '../../ecs/world';
import { BeerObject } from './beerObject';
import { BonfireObject } from './bonfireObject';
import { BridgeObject } from './bridgeObject';
import { BridgeStoneObject } from './bridgeStoneObject';
import { CandleObject } from './candleObject';
import { CannonObject } from './cannonObject';
import { CarriageObject } from './carriageObject';
import { CurtainObject } from './curtainObject';
import { DungeonGateObject } from './dungeonGateObject';
import { FenceObject } from './fenceObject';
import { FireLightObject } from './fireLightObject';
import { FurnitureObject } from './furnitureObject';
import { GrassObject } from './grassObject';
import { HangingObject } from './hangingObject';
import { HouseEtcObject } from './houseEtcObject';
import { HouseObject } from './houseObject';
import { HouseWallObject } from './houseWallObject';
import { LightObject } from './lightObject';
import { MerchantAnimalObject } from './merchantAnimalObject';
import { MuWallObject } from './muWallObject';
import { PoseBoxObject } from './poseBoxObject';
import { ShipObject } from './shipObject';
import { SignObject } from './signObject';
import { StairObject } from './stairObject';
import { SteelDoorObject } from './steelDoorObject';
import { SteelStatueObject } from './steelStatueObject';
import { SteelWallObject } from './steelWallObject';
import { StoneObject } from './stoneObject';
import { StoneStatueObject } from './stoneStatueObject';
import { StoneWallObject } from './stoneWallObject';
import { StrawObject } from './strawObject';
import { StreetLightObject } from './streetLightObject';
import { TentObject } from './tentObject';
import { TombObject } from './tombObject';
import { TreasureChestObject } from './treasureChestObject';
import { TreasureDrumObject } from './treasureDrumObject';
import { TreeObject } from './treeObject';
import { WaterSpoutObject } from './waterSpoutObject';
import { WellObject } from './wellObject';

const DISABLE = false;

export async function createLorencia(world: World) {
  const terrain = world.terrain;

  if (!terrain) return;

  if (DISABLE) return;

  for (let i = 0; i < 13; i++) {
    terrain.MapTileObjects[i] = TreeObject;
  }

  for (let i = 0; i < 8; i++) {
    terrain.MapTileObjects[20 + i] = GrassObject;
  }

  for (let i = 0; i < 5; i++) {
    terrain.MapTileObjects[30 + i] = StoneObject;
  }

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[40 + i] = StoneStatueObject;
  }

  terrain.MapTileObjects[43] = SteelStatueObject;

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[44 + i] = TombObject;
  }

  for (let i = 0; i < 2; i++) {
    terrain.MapTileObjects[50 + i] = FireLightObject;
  }

  terrain.MapTileObjects[52] = BonfireObject;
  terrain.MapTileObjects[55] = DungeonGateObject;

  for (let i = 0; i < 2; i++) {
    terrain.MapTileObjects[56 + i] = MerchantAnimalObject;
  }

  terrain.MapTileObjects[58] = TreasureDrumObject;
  terrain.MapTileObjects[59] = TreasureChestObject;
  terrain.MapTileObjects[60] = ShipObject;

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[65 + i] = SteelWallObject;
  }

  terrain.MapTileObjects[68] = SteelDoorObject;

  for (let i = 0; i < 6; i++) {
    terrain.MapTileObjects[69 + i] = StoneWallObject;
  }

  for (let i = 0; i < 4; i++) {
    terrain.MapTileObjects[75 + i] = MuWallObject;
  }

  terrain.MapTileObjects[80] = BridgeObject;

  for (let i = 0; i < 4; i++) {
    terrain.MapTileObjects[81 + i] = FenceObject;
  }

  terrain.MapTileObjects[85] = BridgeStoneObject;

  terrain.MapTileObjects[90] = StreetLightObject;

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[91 + i] = CannonObject;
  }

  terrain.MapTileObjects[95] = CurtainObject;

  for (let i = 0; i < 2; i++) {
    terrain.MapTileObjects[96 + i] = SignObject;
  }

  for (let i = 0; i < 4; i++) {
    terrain.MapTileObjects[98 + i] = CarriageObject;
  }

  for (let i = 0; i < 2; i++) {
    terrain.MapTileObjects[102 + i] = StrawObject;
  }

  terrain.MapTileObjects[105] = WaterSpoutObject;

  for (let i = 0; i < 4; i++) {
    terrain.MapTileObjects[106 + i] = WellObject;
  }

  terrain.MapTileObjects[110] = HangingObject;
  terrain.MapTileObjects[111] = StairObject;

  for (let i = 0; i < 5; i++) {
    terrain.MapTileObjects[115 + i] = HouseObject;
  }

  terrain.MapTileObjects[120] = TentObject;

  for (let i = 0; i < 6; i++) {
    terrain.MapTileObjects[121 + i] = HouseWallObject;
  }

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[127 + i] = HouseEtcObject;
  }

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[130 + i] = LightObject;
  }

  terrain.MapTileObjects[133] = PoseBoxObject;

  for (let i = 0; i < 7; i++) {
    terrain.MapTileObjects[140 + i] = FurnitureObject;
  }

  terrain.MapTileObjects[150] = CandleObject;

  for (let i = 0; i < 3; i++) {
    terrain.MapTileObjects[151 + i] = BeerObject;
  }
}