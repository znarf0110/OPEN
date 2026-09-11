MU ONLINE JS - MONSTER SYSTEM INSTALL

1. ADD:
   src/ecs/systems/monsterSpawnSystem.ts
   src/ecs/systems/monsterAISystem.ts

2. REPLACE:
   src/ecs/world.ts
   src/ecs/createWorld.ts
   src/ecs/systems/playerControllerSystem.ts

3. STOP REGISTERING:
   TestMonsterSystem

4. src/maps/lorencia/index.ts:
   NO MONSTER CODE IS REQUIRED.
   Leave the current map object file as-is.

5. Behavior:
   - 30 Budge Dragons spawn across the 256x256 field.
   - Spawn attempts avoid a 35-unit radius around the player.
   - Monsters wander around their spawn position.
   - Player within 8 units => normal aggro/chase.
   - Player leaves 8 units => monster returns to spawn.
   - Clicking a monster => LURED.
   - LURED monsters keep chasing regardless of distance.
   - Lure times out after 120 seconds as anti-stuck protection.
   - Invalid/hidden target => return to spawn.
   - Attack starts inside 1.8 units.
   - Damage/HP/death/loot/respawn are intentionally NOT added yet.

IMPORTANT:
The exact field/town boundary is not exposed by the uploaded Lorencia object file.
The current implementation therefore uses a simple distance-from-player field spawn filter.
Once actual Lorencia safe-zone coordinates/terrain flags are available, replace that filter
with a real field-zone check.
