# REAL MU EFFECT PREPARATION

The previous fix was wrong because it renamed OZJ bytes to JPG. That causes the checkerboard you saw.

Do NOT rename:
  .OZJ -> .JPG

Use the existing MU Online JS conversion pipeline.

1. Copy the uploaded `Effect/` folder to:
   Data/Effect/

2. Keep the original MU filenames and extensions:
   Data/Effect/*.bmd
   Data/Effect/*.ozj
   Data/Effect/*.ozt

3. Run the existing converter:
   bun tools/bmdToGlb.ts

4. The converter should create:
   public/game-assets/Effect/down_left_punch.glb
   public/game-assets/Effect/shockwave01.glb

The converter is the same architecture used by muonlinejs:
BMD -> GLB and MU texture conversion rather than treating OZJ as ordinary JPEG bytes.

The effect system in this patch only loads GLB effect models.
No fake checkerboard texture is used.
