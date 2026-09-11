import { runInAction } from 'mobx';
import { CharacterClassNumber, ENUM_WORLD } from './common';
import { deserializeAppearance } from './common/deserializeAppearance';
import { ItemsDatabase } from './common/itemsDatabase';
import { ItemSerializer } from './common/itemSerializer';
import { ModelFactoryPerId } from './common/modelFactoryPerId';
import { ModelObject } from './common/modelObject';
import { MonstersDatabase } from './common/monstersDatabase';
import {
  MonsterActionType,
  PlayerAction,
  ServerPlayerActionType,
} from './common/objects/enum';
import { HelloPacket } from './common/packets/ConnectServerPackets';
import {
  AddCharactersToScopePacket,
  AddNpcsToScopePacket,
  CharacterInformationPacket,
  CharacterInventoryPacket,
  ChatMessagePacket,
  CurrentHealthAndShieldPacket,
  CurrentManaAndAbilityPacket,
  GameServerEnteredPacket,
  ItemDropRemovedPacket,
  ItemsDroppedPacket,
  MapObjectOutOfScopePacket,
  ObjectAnimationPacket,
  ObjectGotKilledPacket,
  ObjectWalkedPacket,
  ServerMessagePacket,
} from './common/packets/ServerToClientPackets';
import { ServerToClientActionMap } from './common/playerActionMapper';
import { PlayerObject } from './common/playerObject';
import { Entity, World } from './ecs/world';
import { createAttributeSystem } from './libs/attributeSystem';
import { Vector3 } from './libs/babylon/exports';
import { EventBus } from './libs/eventBus';
import { Store, UIState } from './store';

function convertDirectionToAngle(direction: number): number {
  return (direction * Math.PI) / 4 - Math.PI / 4;
}

export function spawnPlayer(
  world: World,
  { cls }: { cls?: CharacterClassNumber } = {}
) {
  const playerEntity = world.add({
    transform: {
      pos: new Vector3(),
      rot: Vector3.Zero(),
      scale: 1,
      posOffset: new Vector3(0.5, 0, 0.5),
    },

    modelFactory: PlayerObject,

    pathfinding: {
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      path: [],
      calculated: true,
    },

    playerMoveTo: {
      point: { x: 0, y: 0 },
      handled: true as boolean,
    },

    movement: {
      velocity: { x: 0, y: 0 },
      running: false,
    },

    playerAnimation: {
      action: PlayerAction.PLAYER_SET,
    },

    attributeSystem: createAttributeSystem(),

    visibility: {
      state: 'hidden',
      lastChecked: 0,
    },

    screenPosition: {
      worldOffsetZ: 2.5,
      x: 0,
      y: 0,
    },

    objectNameInWorld: 'Player',

    charAppearance: {
      helm: null,
      armor: null,
      gloves: null,
      pants: null,
      boots: null,
      leftHand: null,
      rightHand: null,
      wings: null,
      charClass: cls ?? CharacterClassNumber.DarkKnight,
      changed: true,
    } satisfies NonNullable<Entity['charAppearance']> as NonNullable<
      Entity['charAppearance']
    >,
  });

  playerEntity.transform.pos.z = 1.7;

  playerEntity.attributeSystem.setValue('isFemale', 0);
  playerEntity.attributeSystem.setValue('isFlying', 0);
  playerEntity.attributeSystem.setValue('currentHealth', 0);
  playerEntity.attributeSystem.setValue('currentMana', 0);
  playerEntity.attributeSystem.setValue('maxHealth', 1);
  playerEntity.attributeSystem.setValue('maxMana', 1);
  playerEntity.attributeSystem.setValue('totalMovementSpeed', 3);

  playerEntity.attributeSystem.setValue(
    'playerNetClass',
    cls ?? CharacterClassNumber.DarkKnight
  );

  return playerEntity;
}

let serverListRequested = false;

// ============================================================
// HELLO
// ============================================================

EventBus.on('Hello', packet => {
  const p = new HelloPacket(packet);

  if (serverListRequested) return;

  serverListRequested = true;

  Store.updateServerListRequest();
});

// ============================================================
// GAME SERVER ENTERED
// ============================================================

EventBus.on('GameServerEntered', bytes => {
  const p = new GameServerEnteredPacket(bytes);

  const id = p.PlayerId & 0x7fff;

  Store.playerId = id;

  console.log(`PlayerID: ${Store.playerId}`);

  Store.uiState = UIState.Login;
});

// ============================================================
// CHARACTER INFORMATION
// ============================================================

EventBus.on('CharacterInformation', packet => {
  const p = new CharacterInformationPacket(packet);

  const playerData = Store.playerData;

  runInAction(() => {
    playerData.money = p.Money;

    playerData.x = p.X;
    playerData.y = p.Y;

    playerData.exp = Number(p.CurrentExperience);
    playerData.expToNextLvl = Number(p.ExperienceForNextLevel);

    playerData.points = p.LevelUpPoints;

    playerData.str = p.Strength;
    playerData.agi = p.Agility;
    playerData.sta = p.Vitality;
    playerData.eng = p.Energy;

    playerData.currentHP = p.CurrentHealth;
    playerData.maxHP = p.MaximumHealth;

    playerData.currentMP = p.CurrentMana;
    playerData.maxMP = p.MaximumMana;

    playerData.currentSD = p.CurrentShield;
    playerData.maxSD = p.MaximumShield;

    playerData.currentAG = p.CurrentAbility;
    playerData.maxAG = p.MaximumAbility;

    Store.uiState = UIState.World;

    EventBus.emit('requestWarp', {
      map: p.MapId,
      pos: {
        x: p.X,
        y: p.Y,
      },
    });
  });
});

// ============================================================
// CHARACTER INVENTORY
// ============================================================

EventBus.on('CharacterInventory', packet => {
  const items = Store.playerData.items;

  const p = new CharacterInventoryPacket(packet);

  p.getItems(p.ItemCount).forEach(item => {
    const itemSlot = item.ItemSlot;
    const data = item.ItemData;

    const itemData = ItemSerializer.DeserializeItem(
      new Uint8Array(data.buffer)
    );

    items[itemSlot] = itemData;
  });

  Store.syncPlayerAppearance();
});

// ============================================================
// HEALTH / SHIELD
// ============================================================

EventBus.on('CurrentHealthAndShield', packet => {
  const p = new CurrentHealthAndShieldPacket(packet);

  const playerEntity = Store.world?.playerEntity;

  if (!playerEntity) return;

  playerEntity.attributeSystem.setValue(
    'currentHealth',
    p.Health
  );

  Store.playerData.currentHP = Math.floor(p.Health);
  Store.playerData.currentSD = Math.floor(p.Shield);
});

// ============================================================
// MANA / ABILITY
// ============================================================

EventBus.on('CurrentManaAndAbility', packet => {
  const p = new CurrentManaAndAbilityPacket(packet);

  const playerEntity = Store.world?.playerEntity;

  if (!playerEntity) return;

  playerEntity.attributeSystem.setValue(
    'currentMana',
    p.Mana
  );

  Store.playerData.currentMP = Math.floor(p.Mana);
  Store.playerData.currentAG = Math.floor(p.Ability);
});

// ============================================================
// NPCs
// ============================================================

EventBus.on('AddNpcsToScope', packet => {
  const p = new AddNpcsToScopePacket(packet);

  const npcs = p.getNPCs();

  console.log('[Network] AddNpcsToScope:', npcs);

  const world = Store.world;

  if (!world) return;

  const worldIndex = world.mapIndex;

  npcs.forEach(npc => {
    const id = npc.Id & 0x7fff;

    /*
     * Check if this entity already exists.
     */
    const existingEntity = world.netObjsQuery.entities.find(
      e => e.netId === id
    );

    if (existingEntity) {
      /*
       * Do not accidentally use a player entity as an NPC.
       */
      if ('playerAnimation' in existingEntity) {
        console.warn(
          `[Network] NPC ID ${id} already belongs to a player entity`
        );

        return;
      }

      existingEntity.transform.pos.x =
        npc.CurrentPositionX;

      existingEntity.transform.pos.z =
        npc.CurrentPositionY;

      existingEntity.transform.pos.y =
        world.getTerrainHeight(
          npc.CurrentPositionX,
          npc.CurrentPositionY
        );

      existingEntity.transform.rot.y =
        convertDirectionToAngle(
          npc.Rotation
        );

      /*
       * Restore the NPC if it had been marked out of scope.
       */
      if (existingEntity.objOutOfScope) {
        world.removeComponent(
          existingEntity,
          'objOutOfScope'
        );
      }

      /*
       * Make sure the NPC can be displayed again.
       */
      if (existingEntity.visibility) {
        existingEntity.visibility.state = 'visible';
        existingEntity.visibility.lastChecked = 0.2;
      }

      return;
    }

    const definedModelFactory =
      ModelFactoryPerId[npc.TypeNumber];

    if (!definedModelFactory) {
      console.warn(
        `No model factory found for NPC type ${npc.TypeNumber}. Using default PlayerObject.`
      );
    }

    const modelFactory =
      definedModelFactory || PlayerObject;

    const npcEntity = world.add({
      netId: id,

      worldIndex,

      npcType: npc.TypeNumber,

      transform: {
        pos: new Vector3(
          npc.CurrentPositionX,
          world.getTerrainHeight(
            npc.CurrentPositionX,
            npc.CurrentPositionY
          ),
          npc.CurrentPositionY
        ),

        rot: new Vector3(
          0,
          convertDirectionToAngle(
            npc.Rotation
          ),
          0
        ),

        scale:
          modelFactory.OverrideScale >= 0
            ? modelFactory.OverrideScale
            : 1,
      },

      modelFactory,

      pathfinding: {
        from: { x: 0, y: 0 },
        to: { x: 0, y: 0 },
        path: [],
        calculated: true,
      },

      playerMoveTo: {
        point: { x: 0, y: 0 },
        handled: true as boolean,
      },

      movement: {
        velocity: { x: 0, y: 0 },
        running: false,
      },

      monsterAnimation: {
        action: MonsterActionType.Stop1,
      },

      attributeSystem:
        createAttributeSystem(),

      visibility: {
        lastChecked: 0,
        state: 'hidden',
      },

      screenPosition: {
        worldOffsetZ: 2.5,
        x: 0,
        y: 0,
      },

      objectNameInWorld:
        MonstersDatabase.get(
          npc.TypeNumber
        )?.Name || 'NPC',

      interactable: true,
    });

    npcEntity.attributeSystem?.setValue(
      'isFemale',
      0
    );

    npcEntity.attributeSystem?.setValue(
      'isFlying',
      0
    );
  });
});

// ============================================================
// OTHER CHARACTERS
// ============================================================

EventBus.on('AddCharactersToScope', packet => {
  const p = new AddCharactersToScopePacket(packet);

  const chars = p.getCharacters();

  console.log(
    '[Network] AddCharactersToScope:',
    chars
  );

  const world = Store.world;

  if (!world) return;

  const worldIndex = world.mapIndex;

  chars.forEach(char => {
    const maskedId = char.Id & 0x7fff;

    const appearance =
      deserializeAppearance(char.Appearance);

    /*
     * ========================================================
     * FIND EXISTING PLAYER
     * ========================================================
     *
     * We only search for an entity that is actually a player.
     */
    let playerEntity =
      world.netObjsQuery.entities.find(
        entity =>
          entity.netId === maskedId &&
          'playerAnimation' in entity
      );

    /*
     * ========================================================
     * CREATE PLAYER
     * ========================================================
     *
     * Do NOT assign spawnPlayer() directly to playerEntity.
     *
     * spawnPlayer() returns an entity that does not yet have
     * netId/worldIndex from TypeScript's point of view.
     */
    if (!playerEntity) {
      const createdPlayer = spawnPlayer(world, {
        cls: appearance.cls,
      });

      /*
       * Add the network identity.
       */
      world.addComponent(
        createdPlayer,
        'netId',
        maskedId
      );

      /*
       * Add the world/map identity.
       */
      world.addComponent(
        createdPlayer,
        'worldIndex',
        worldIndex
      );

      /*
       * Find it again through the network-object query.
       *
       * Now TypeScript knows this entity has:
       *   - netId
       *   - transform
       */
      playerEntity =
        world.netObjsQuery.entities.find(
          entity =>
            entity.netId === maskedId &&
            'playerAnimation' in entity
        );

      /*
       * This should never happen, but it protects the
       * rest of the handler from an invalid entity.
       */
      if (!playerEntity) {
        console.error(
          `[Network] Failed to register player entity: ${maskedId}`
        );

        return;
      }

      console.log(
        `[Network] CREATED PLAYER: ${maskedId} - ${char.Name}`
      );
    } else {
      /*
       * ======================================================
       * REUSE EXISTING PLAYER
       * ======================================================
       */
      console.log(
        `[Network] REUSING PLAYER: ${maskedId} - ${char.Name}`
      );

      /*
       * Remove a stale out-of-scope flag if one somehow exists.
       */
      if (playerEntity.objOutOfScope) {
        world.removeComponent(
          playerEntity,
          'objOutOfScope'
        );
      }
    }

    /*
     * ========================================================
     * RESTORE WORLD INDEX
     * ========================================================
     */
    if (playerEntity.worldIndex !== worldIndex) {
      playerEntity.worldIndex = worldIndex;
    }

    /*
     * ========================================================
     * RESTORE POSITION
     * ========================================================
     */
    playerEntity.transform.pos.x =
      char.CurrentPositionX;

    playerEntity.transform.pos.z =
      char.CurrentPositionY;

    playerEntity.transform.pos.y =
      world.getTerrainHeight(
        char.CurrentPositionX,
        char.CurrentPositionY
      );

    /*
     * ========================================================
     * RESTORE ROTATION
     * ========================================================
     */
    playerEntity.transform.rot.y =
      convertDirectionToAngle(
        char.Rotation
      );

    /*
     * ========================================================
     * FORCE PLAYER VISIBLE
     * ========================================================
     *
     * Remote players should never remain hidden because of
     * the normal object visibility system.
     */
    if (playerEntity.visibility) {
      playerEntity.visibility.state = 'visible';
      playerEntity.visibility.lastChecked = 0.2;
    }

    /*
     * ========================================================
     * RESET MOVEMENT
     * ========================================================
     */
    if (playerEntity.movement) {
      playerEntity.movement.velocity.x = 0;
      playerEntity.movement.velocity.y = 0;
      playerEntity.movement.running = false;
    }

    /*
     * ========================================================
     * CANCEL OLD CLICK-TO-MOVE STATE
     * ========================================================
     */
    if (playerEntity.playerMoveTo) {
      playerEntity.playerMoveTo.handled = true;
    }

    /*
     * ========================================================
     * CLEAR OLD PATH
     * ========================================================
     */
    if (playerEntity.pathfinding) {
      playerEntity.pathfinding.path = [];
      playerEntity.pathfinding.calculated = true;
    }

    /*
     * ========================================================
     * RESTORE NAME
     * ========================================================
     */
    playerEntity.objectNameInWorld =
      char.Name;

    /*
     * ========================================================
     * LOCAL PLAYER
     * ========================================================
     */
    if (Store.playerId === maskedId) {
      if (!playerEntity.localPlayer) {
        world.addComponent(
          playerEntity,
          'localPlayer',
          true
        );
      }

      console.log(
        `[Network] LOCAL PLAYER: ${maskedId} - ${char.Name}`
      );
    }

    /*
     * ========================================================
     * RESTORE APPEARANCE
     * ========================================================
     */
    if (playerEntity.charAppearance) {
      const cApp =
        playerEntity.charAppearance;

      cApp.leftHand =
        appearance.leftHand;

      cApp.rightHand =
        appearance.rightHand;

      cApp.helm =
        appearance.helm;

      cApp.armor =
        appearance.armor;

      cApp.pants =
        appearance.pants;

      cApp.gloves =
        appearance.gloves;

      cApp.boots =
        appearance.boots;

      /*
       * Tell the appearance system that the equipment
       * needs to be rebuilt.
       */
      cApp.changed = true;
    }

    console.log(
      `[Network] PLAYER READY: ${maskedId} - ${char.Name}`
    );
  });
});

// ============================================================
// OBJECT OUT OF SCOPE
// ============================================================

EventBus.on('MapObjectOutOfScope', packet => {
  const p = new MapObjectOutOfScopePacket(packet);

  const world = Store.world;

  if (!world) {
    return;
  }

p.getObjects(p.ObjectCount).forEach(obj => {
  const maskedId = obj.Id & 0x7fff;

  const entity =
    world.netObjsQuery.entities.find(
      e => e.netId === maskedId
    );

  console.log(
    '[SCOPE EVENT]',
    {
      id: maskedId,
      entityFound: !!entity,
      isPlayer: entity
        ? 'playerAnimation' in entity
        : false,
    }
  );

  if (!entity) {
    console.log(
      `[Scope] Entity not found: ${maskedId}`
    );

    return;
  }

  if ('playerAnimation' in entity) {
    console.log(
      `[Scope] IGNORE REMOTE PLAYER: ${maskedId}`
    );

    if (entity.visibility) {
      entity.visibility.state = 'visible';
      entity.visibility.lastChecked = 0.2;
    }

    if (entity.objOutOfScope) {
      world.removeComponent(
        entity,
        'objOutOfScope'
      );
    }

    return;
  }

  if (!entity.objOutOfScope) {
    world.addComponent(
      entity,
      'objOutOfScope',
      true
      );
    }
  });
});

// ============================================================
// OBJECT WALKED
// ============================================================

EventBus.on('ObjectWalked', packet => {
  const p =
    new ObjectWalkedPacket(packet);

  const world = Store.world;

  if (!world) return;

  const maskedId =
    p.ObjectId & 0x7fff;

  const obj =
    world.netObjsQuery.entities.find(
      e => e.netId === maskedId
    );

  if (!obj) {
    console.log(
      `[Network] ObjectWalked entity not found: ${maskedId}`
    );

    return;
  }

  /*
   * Do not overwrite our local keyboard movement with
   * server movement packets.
   */
  if (obj.localPlayer) {
    return;
  }

  if (obj.playerMoveTo) {
    obj.playerMoveTo.handled =
      false;

    obj.playerMoveTo.point.x =
      p.TargetX;

    obj.playerMoveTo.point.y =
      p.TargetY;
  } else {
    obj.transform.pos.x =
      p.TargetX;

    obj.transform.pos.z =
      p.TargetY;
  }

  obj.transform.rot.y =
    convertDirectionToAngle(
      p.TargetRotation
    );

  const dirs =
    new Array(p.StepCount).fill(0);

  for (
    let i = 0;
    i < p.StepCount;
    i++
  ) {
    dirs[i] =
      p.StepData.getUint8(i);
  }

  console.log(
    `ObjectWalked: ${maskedId}, steps: ${p.StepCount}, directions: ${dirs.join(
      '->'
    )}, x: ${p.TargetX}, y: ${p.TargetY}, rotation: ${p.TargetRotation}`,
    packet
  );
});

// ============================================================
// CHAT
// ============================================================

EventBus.on('ChatMessage', packet => {
  const p =
    new ChatMessagePacket(packet);

  console.log(
    `ChatMessage: ${p.Type}, sender:${p.Sender}, msg: ${p.Message}`,
    p
  );
});

// ============================================================
// OBJECT ANIMATION
// ============================================================

EventBus.on('ObjectAnimation', packet => {
  const p =
    new ObjectAnimationPacket(packet);

  const maskedId =
    p.ObjectId & 0x7fff;

  const obj =
    Store.world?.netObjsQuery.entities.find(
      e => e.netId === maskedId
    );

  if (!obj) {
    console.log(
      `[Network] ObjectAnimation entity not found: ${maskedId}`
    );

    return;
  }

  let serverActionId =
    p.Animation as ServerPlayerActionType;

  let clientActionToPlay =
    serverActionId;

  if (obj.monsterAnimation) {
    clientActionToPlay =
      ((serverActionId & 0xe0) >> 5) &
      0xff;
  }

  console.log(
    `ObjectAnimation: ${maskedId}, action: ${clientActionToPlay}, target: ${p.TargetId}, dir:${p.Direction}`,
    packet
  );

  if (obj.monsterAnimation) {
    obj.monsterAnimation.action =
      clientActionToPlay as any;
  } else if (obj.playerAnimation) {
    const action =
      ServerToClientActionMap[
        clientActionToPlay
      ];

    if (action !== undefined) {
      obj.playerAnimation.action =
        action;
    }
  }

  obj.transform.rot.y =
    convertDirectionToAngle(
      p.Direction
    );
});

// ============================================================
// OBJECT KILLED
// ============================================================

EventBus.on('ObjectGotKilled', packet => {
  const p =
    new ObjectGotKilledPacket(packet);

  const killedId =
    p.KilledId & 0x7fff;

  const obj =
    Store.world?.netObjsQuery.entities.find(
      e => e.netId === killedId
    );

  if (!obj) return;

  if (obj.localPlayer) {
    return;
  }

  if (obj.monsterAnimation) {
    obj.monsterAnimation.action =
      MonsterActionType.Die;
  } else if (obj.playerAnimation) {
    obj.playerAnimation.action =
      PlayerAction.PLAYER_DIE1;
  }
});

// ============================================================
// ITEMS DROPPED
// ============================================================

EventBus.on('ItemsDropped', packet => {
  const world = Store.world;

  if (!world) return;

  const p =
    new ItemsDroppedPacket(packet);

  console.log(
    `ItemsDropped: ${p.ItemCount} items dropped`,
    p
  );

  p.getItems(
    p.ItemCount
  ).forEach(item => {
    const maskedId =
      item.Id & 0x7fff;

    const data =
      item.ItemData;

    const id =
      data.getUint8(0);

    const group =
      data.getUint8(5) >> 4;

    const isMoney =
      data.byteLength >= 6 &&
      id === 15 &&
      group === 14;

    const itemConfig =
      ItemsDatabase.getItem(
        group,
        id
      );

    if (isMoney) {
      const amount =
        (data.getUint8(1) << 16) |
        (data.getUint8(2) << 8) |
        data.getUint8(4);

      console.log(
        `Dropped Money: Amount=${amount}, ID=${maskedId}`
      );
    } else {
      console.log(
        `Dropped Item: DataLen=${data.byteLength}, ID=${maskedId}`
      );
    }

    if (!itemConfig) {
      console.warn(
        `No item config found for dropped item ${maskedId}`
      );

      return;
    }

    /*
     * Avoid creating duplicate item entities.
     */
    const existingItem =
      world.netObjsQuery.entities.find(
        e =>
          e.netId === maskedId &&
          !('playerAnimation' in e) &&
          !('monsterAnimation' in e)
      );

    if (existingItem) {
      existingItem.transform.pos.x =
        item.PositionX;

      existingItem.transform.pos.z =
        item.PositionY;

      existingItem.transform.pos.y =
        world.getTerrainHeight(
          item.PositionX,
          item.PositionY
        ) + 0.1;

      if (existingItem.objOutOfScope) {
        world.removeComponent(
          existingItem,
          'objOutOfScope'
        );
      }

      return;
    }

    world.add({
      netId: maskedId,

      transform: {
        pos: new Vector3(
          item.PositionX,
          world.getTerrainHeight(
            item.PositionX,
            item.PositionY
          ) + 0.1,
          item.PositionY
        ),

        rot: Vector3.Zero(),

        scale: 1,
      },

      modelFactory: ModelObject,

      modelFilePath:
        itemConfig.szModelFolder +
        itemConfig.szModelName,
    });
  });
});

// ============================================================
// ITEM DROP REMOVED
// ============================================================

EventBus.on('ItemDropRemoved', packet => {
  const p = new ItemDropRemovedPacket(packet);
  const world = Store.world;

  if (!world) return;

  p.getItemData(p.ItemCount).forEach(item => {
    const maskedId = item.Id & 0x7fff;

    const entity = world.netObjsQuery.entities.find(
      e => e.netId === maskedId
    );

    if (!entity) {
      return;
    }

    /*
     * Never remove a player because of an item-drop packet.
     */
    if ('playerAnimation' in entity) {
      return;
    }

    /*
     * Mark the dropped item for normal out-of-scope cleanup.
     */
    if (!entity.objOutOfScope) {
      world.addComponent(
        entity,
        'objOutOfScope',
        true
      );
    }
  });
});

// ============================================================
// SERVER MESSAGE
// ============================================================

EventBus.on('ServerMessage', packet => {
  const p =
    new ServerMessagePacket(packet);

  console.log(p);

  let color = '#fff';

  switch (p.Type) {
    case 0:
      color = '#ffd700';
      break;

    case 1:
      color = '#0000ff';
      break;

    case 2:
      color = '#00ff00';
      break;
  }

  console.log(
    `%cServerMessage: ${p.Message}`,
    `color: ${color}; font-weight: bold; font-size: 1em;`
  );
});