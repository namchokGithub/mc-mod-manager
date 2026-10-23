# Helloworld — Beyond the Descendant: Build Guide

จัดใหม่เป็น **10 Batches** จากไฟล์ล่าสุดเพียงไฟล์เดียว · รายชื่อเดิม 248 แถว = **241 ม็อดไม่ซ้ำ** · ไม่เพิ่มม็อดจากรายการเก่า

แถวซ้ำ 7 แถวถูกรวมเป็นจุดติดตั้งหลักครั้งเดียว: Puzzles Lib, Cloth Config API, Corpse, Corpse x Curios API Compat, Curios API, BaguetteLib และ FTB Library; รายละเอียดต้นฉบับทุกแถวอยู่ใน audit JSON

ลำดับ: P0 = ฐาน/ตรวจเป็นอันดับแรก, P1 = ระบบหลัก, P2 = ฟีเจอร์เสริม; หมายเลข Batch และ Step คือ installation order ส่วน Priority ใช้เลือกว่าจะเก็บฟีเจอร์ใดไว้ ไม่ให้ข้าม required dependency

**Cumulative testing:** ติดตั้งเพิ่มจาก Batch ก่อนหน้าที่ผ่านแล้ว ไม่เริ่มแพ็กใหม่ทุก Batch ก่อนทุก Step สำรอง world saves + config + scripts; หลังเพิ่มให้ตรวจ startup → โหลดโลก → gameplay ของ Step → reconnect/restart เมื่อมีปัญหาสำคัญหยุดและตรวจม็อดที่เพิ่งเพิ่ม อนุญาต isolated profile เพื่อหาสาเหตุ

**สถานะ:** รายการไม่มีป้ายเป็น planned `not_run`; `[blocked]` ต้องแก้รุ่น/dependency ก่อน หรือบันทึกว่าไม่เลือกใช้ในรอบนี้แล้วตรวจ dependents ตาม ส่วน `Other` เป็นรายการพัก ยังไม่ติดตั้งและไม่นับในจำนวนสะสมหลัก ไม่มีการเปิด Minecraft ติดตั้งม็อด build หรือทดสอบ runtime ในงานนี้

**ขอบเขต verification:** ไฟล์ต้นฉบับมีเพียงชื่อ/หมวด ไม่มี URL, version หรือ manifest; ใช้ NeoForge 26.1.2 เป็นขอบเขตตรวจ metadata ของเป้าหมายแพ็ก ไม่ใช่การยืนยันไฟล์ที่ผู้ใช้ติดตั้งจริง ชื่อที่กำกวมคงเดิมและเป็น `needs_verification`; ข้อมูลโครงการ/แท็กรุ่นเป็น `partially_verified` ไม่มีม็อดใดถูกประกาศ verified compatibility

**ด้านติดตั้ง:** ดู installation_side ใน audit JSON ซึ่งอิงข้อมูลผู้เผยแพร่ ไม่อิง category; library ที่ยังไม่ชัดไม่ถือว่า client+server required โดยอัตโนมัติ Iris Shaders เป็น shader loader mod; ไฟล์นี้ไม่มีรายชื่อ shader pack/resource pack/data pack แยก จึงไม่เพิ่มแพ็กจากรายการเก่า

## Batch 1 — Foundation & Performance

26 mods (17 main + 9 Other)

ฐานเกมและประสิทธิภาพก่อนเพิ่มเนื้อหา; Other เป็นรายการพักรอตัดสินใจ ไม่ติดตั้งรวมกับ foundation

**new_mods:** 17 · **inherited_mods:** 0 · **สะสมจากรายชื่อเดิมตามแผน:** 17 · ไม่รวม Other

### 1.1 Backup & Recovery

1 mod

- FTB Backups 3 — Server Utility `[blocked]`

**Priority:** P0 · **ทดสอบ:** สำรองด้วยมือก่อนเริ่มทุก Batch อยู่แล้ว; เมื่อยืนยันรุ่น backup mod ให้ทดสอบ restore บนสำเนา

### 1.2 Core & Recipe Performance

5 mods

- ModernFix — Optimization
- Clumps — Storage `[blocked]`
- Placebo — Library
- FastSuite — Optimization
- FastFurnace — Optimization

**Priority:** P0 · **ทดสอบ:** เปิดเกมและทดสอบ furnace/recipe/XP โดยเปรียบเทียบกับ baseline

### 1.3 Client Rendering

5 mods

- Sodium — Optimization
- ImmediatelyFast — Optimization
- Better Biome Blend — Optimization
- Cloth Config API — Library
- More Culling — Library

**Priority:** P0 · **ทดสอบ:** ตรวจภาพที่ระยะใกล้–ไกล เปลี่ยนฉากและเปรียบเทียบ FPS

### 1.4 Server Performance

3 mods

- AI Improvements: Performance Tuning — Optimization
- Achievements Optimizer — Optimization `[blocked]`
- I'm Fast — Game Mechanics

**Priority:** P1 · **ทดสอบ:** ตรวจ startup โหลดโลกและเปรียบเทียบ TPS/MSPT ทีละตัว

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Architectury API

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** AI Improvements: Performance Tuning → Architectury API → Achievements Optimizer → I'm Fast

### 1.5 Dropped Items & Despawn

3 mods

- Get It Together, Drops! — Optimization
- Almanac — Library
- Let Me Despawn — Optimization

**Priority:** P1 · **ทดสอบ:** โยน/เก็บของ ตรวจจำนวนไอเทมและม็อบตั้งชื่อ/ม็อบเลี้ยงหลัง reload

### 1.6 Other

9 mods

- Roughly Enough Items (REI) — Other `[blocked]`
- Cupboard — Uncategorized `[blocked]`
- libIPN — Library
- MossyLib — Library
- WorldEdit — Library
- Yung Structures Addon for Loot Integrations — Addons `[blocked]`
- Trinkets Updated — Equipment
- Chunky — Optimization `[blocked]`
- Dynamic View and Simulation Distances — Server Utility `[blocked]`

**Priority:** พัก · **ทดสอบ:** รายการนอกแผนหลัก/เครื่องมือเฉพาะกิจ/รอตรวจ เลือกใช้ภายหลังแล้วทดสอบแยก ไม่ถือว่าติดตั้งใน Batch 1

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Architectury API, Loot Integrations

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Roughly Enough Items (REI) → Cupboard → libIPN → MossyLib → WorldEdit → Loot Integrations → Yung Structures Addon for Loot Integrations → Trinkets Updated → Chunky → Dynamic View and Simulation Distances

### 1.7 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–1 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 2 — Interface, Inventory & Player Information

29 mods

ทำให้การตรวจสูตร ข้อมูลไอเทม แผนที่ และ UI พร้อมก่อนทดสอบเนื้อหา

**new_mods:** 29 · **inherited_mods:** 17 · **สะสมจากรายชื่อเดิมตามแผน:** 46

### 2.1 Recipe Browser

1 mod

- Just Enough Items (JEI) — Library `[blocked]`

**Priority:** P0 · **ทดสอบ:** เปิดสูตรและกด recipe transfer; ใช้ JEI เป็น browser หลัก

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** MezzConfig

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** MezzConfig → Just Enough Items (JEI)

### 2.2 Inspection & Food Information

3 mods

- Jade 🔍 — Utility
- Jade Addons (Neo/Forge) — Utility
- AppleSkin — Food

**Priority:** P0 · **ทดสอบ:** ตรวจ block/entity tooltip และค่าอาหารทั้ง client/server

### 2.3 Inventory Controls

5 mods

- Mouse Tweaks — Storage
- Durability Tooltip — Utility `[blocked]`
- Balm — Library
- TrashSlot — Game Mechanics
- Crafting Tweaks — Management `[blocked]`

**Priority:** P1 · **ทดสอบ:** ย้าย/ทิ้ง/คราฟต์ของ ตรวจจำนวนหลัง reconnect

### 2.4 Maps & Navigation UI

2 mods

- Xaero's Minimap — Adventure
- Xaero's World Map — Adventure

**Priority:** P1 · **ทดสอบ:** สร้าง waypoint เดินข้าม chunk และตรวจแผนที่หลัง reconnect

### 2.5 Zoom & Debug

3 mods

- BetterF3 — Decoration
- Konkrete — Library
- Just Zoom — Utility

**Priority:** P1 · **ทดสอบ:** ทดสอบ zoom/debug และปุ่มลัด

### 2.6 Tooltips & Notifications

9 mods

- YetAnotherConfigLib (YACL) — Library
- Better Advancements — Utility
- Prism — Decoration
- Legendary Tooltips — Adventure `[blocked]`
- Item Borders — Adventure `[blocked]`
- Item Highlighter — Adventure `[blocked]`
- Item Descriptions — Utility
- Fragmentum — Library
- Loot Journal: Pickup Notifier — Other

**Priority:** P2 · **ทดสอบ:** ตรวจ tooltip ขอบไอเทม advancement และแจ้งเตือนรับของ

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Iceberg

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** YetAnotherConfigLib (YACL) → Better Advancements → Prism → Iceberg → Legendary Tooltips → Item Borders → Item Highlighter → Item Descriptions → Fragmentum → Loot Journal: Pickup Notifier

### 2.7 HUD & Client Cosmetics

6 mods

- \[ETF\] Entity Texture Features — Decoration
- \[EMF\] Entity Model Features — Mobs
- Puzzles Lib — Library
- Health Bars — Mobs
- Overflowing Bars — Game Mechanics
- Overloaded Armor Bar — Uncategorized `[blocked]`

**Priority:** P2 · **ทดสอบ:** ทดสอบ HUD กับจำนวนหัวใจ/เกราะสูง ตรวจโมเดลและ texture โดยยังปิด shader

### 2.8 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–2 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 3 — Travel, Survival & Multiplayer Utilities

23 mods

การเดินทาง การตาย การกู้ไอเทม และระบบทีมพื้นฐานที่ใช้ตลอดแพ็ก

**new_mods:** 23 · **inherited_mods:** 46 · **สะสมจากรายชื่อเดิมตามแผน:** 69

### 3.1 Fast Travel & Exploration

6 mods

- Shogi — Library
- Waystones — Adventure
- Recall Potion — Other `[blocked]`
- Nature's Compass — Adventure
- Explorer's Compass — Adventure
- Field Guide — Utility `[blocked]`

**Priority:** P1 · **ทดสอบ:** วาร์ป ค้นหา biome/structure และตรวจข้อมูลหลัง reconnect

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Immersive Overlays

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Shogi → Waystones → Recall Potion → Nature's Compass → Explorer's Compass → Immersive Overlays → Field Guide

### 3.2 Rest & Survival

5 mods

- Collective — Library
- Healing Campfire — Adventure
- Comforts — Adventure
- Sit — Game Mechanics `[blocked]`
- Dream Cocoon — Utility

**Priority:** P1 · **ทดสอบ:** นอน นั่ง ใช้ campfire และตรวจจุดเกิด/ผลต่อผู้เล่นหลายคน

### 3.3 Carry & World Interaction

1 mod

- Carry On — Game Mechanics

**Priority:** P1 · **ทดสอบ:** ยก/วาง container และตรวจของไม่หายหรือซ้ำ

### 3.4 Death, Accessories & XP

7 mods

- Corpse — Adventure
- XP Tome — Adventure
- Curios API — Equipment
- BaguetteLib — Other
- Corpse x Curios API Compat — Other
- Inventory Totem — Game Mechanics
- The Grave Scrolls — Adventure

**Priority:** P0 · **ทดสอบ:** ตาย เก็บ corpse คืน accessory/XP และตรวจจำนวนไอเทมหลัง restart

### 3.5 Teams, Claims & Mining

4 mods

- FTB Library — API and Library `[blocked]`
- FTB Teams — API and Library `[blocked]`
- FTB Ultimine — Server Utility `[blocked]`
- FTB Chunks — Uncategorized `[blocked]`

**Priority:** P1 · **ทดสอบ:** ตั้งทีม claim ให้สิทธิ์และขุดหมู่ ตรวจการป้องกันพื้นที่

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Architectury API

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** FTB Library → FTB Teams → FTB Ultimine → FTB Chunks

### 3.6 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–3 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 4 — Biomes, Structures, Dungeons & Loot

24 mods

ล็อกภูมิประเทศและโครงสร้างหลักก่อนลงระบบฟาร์ม/การต่อสู้; ใช้โลกทดสอบใหม่

**new_mods:** 24 · **inherited_mods:** 69 · **สะสมจากรายชื่อเดิมตามแผน:** 93

### 4.1 Biome Foundation

3 mods

- GlitchCore — Library
- TerraBlender — Library
- Biomes O' Plenty — Adventure

**Priority:** P0 · **ทดสอบ:** สร้างโลกใหม่ ตรวจ biome ไม้/บล็อก และการเชื่อมต่อภูมิประเทศ

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.2 Terrain Integration

2 mods

- Lithostitched — Library
- Terralith — Worldgen

**Priority:** P0 · **ทดสอบ:** สร้างโลกใหม่ที่มี BOP และ Terralith ตรวจ terrain หลาย seed

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.3 Villages & Underground

3 mods

- Cristel Lib — Library
- Towns and Towers — Adventure
- Underground Village, Stoneholm — Adventure `[blocked]`

**Priority:** P1 · **ทดสอบ:** ตรวจหมู่บ้าน/ใต้ดินและกล่อง loot ใน chunk ใหม่

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Better Library

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Cristel Lib → Towns and Towers → Better Library → Underground Village, Stoneholm

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.4 YUNG Foundation & Underground

3 mods

- YUNG's API — Library
- YUNG's Better Mineshafts — Adventure
- YUNG's Better Dungeons — Adventure

**Priority:** P1 · **ทดสอบ:** ตรวจ mineshaft/dungeon และบันทึกพิกัดตัวอย่าง

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.5 Temples, Monuments & Strongholds

5 mods

- YUNG's Better Desert Temples — Adventure
- YUNG's Better Jungle Temples — Adventure
- YUNG's Better Witch Huts — Adventure
- YUNG's Better Ocean Monuments — Adventure
- YUNG's Better Strongholds — Adventure

**Priority:** P1 · **ทดสอบ:** สำรวจแต่ละโครงสร้าง ตรวจ mob/loot/ทางเข้า

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.6 Nether & End

2 mods

- YUNG's Better Nether Fortresses — Adventure
- YUNG's Better End Island — Adventure

**Priority:** P1 · **ทดสอบ:** ใช้ Nether/End ใหม่ ตรวจ fortress และเกาะ End

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.7 Landscape & Large Dungeons

5 mods

- YUNG's Bridges — Adventure
- YUNG's Extras — Adventure
- Structory — Adventure
- Structory: Towers — Adventure
- When Dungeons Arise — Adventure `[blocked]`

**Priority:** P1 · **ทดสอบ:** ตรวจความถี่โครงสร้าง การทับกัน และเวลาสร้าง chunk

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.8 Shared Loot

1 mod

- Lootr — Utility

**Priority:** P1 · **ทดสอบ:** ผู้เล่นสองคนเปิดกล่องเดียวกัน ตรวจ loot แยกและ reload

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 4.9 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–4 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 5 — Storage, Backpacks, Farming & Economy

30 mods

ระบบคลัง กระเป๋า อาหาร และการค้าที่ต้องทดสอบร่วมกัน

**new_mods:** 30 · **inherited_mods:** 93 · **สะสมจากรายชื่อเดิมตามแผน:** 123

### 5.1 Core Storage

6 mods

- Storage Drawers — Storage
- SuperMartijn642's Config Lib — Library
- SuperMartijn642's Core Lib — Library
- Sophisticated Core — Library
- Sophisticated Storage — Storage
- Trash Cans — Uncategorized

**Priority:** P0 · **ทดสอบ:** ฝากถอน เชื่อม hopper และตรวจจำนวนของก่อน–หลัง restart

### 5.2 Backpacks & Transfers

7 mods

- Sophisticated Storage in Motion — Storage
- Sophisticated Tab — Uncategorized `[blocked]`
- Sophisticated Inventory Interactions — Management
- Sophisticated JEI Index — Storage
- Sophisticated Backpacks — Storage
- More Tier Upgrade — Uncategorized `[blocked]`
- Bundle Upgrade — Storage

**Priority:** P1 · **ทดสอบ:** อัปเกรดกระเป๋า recipe transfer ตาย/กู้ของและ reconnect

### 5.3 Storage Network & Crafting

3 mods

- Iron Furnaces — Storage `[blocked]`
- Tom's Simple Storage Mod — Storage
- Polymorph+ — Utility `[blocked]`

**Priority:** P1 · **ทดสอบ:** เชื่อมคลัง คราฟต์สูตรซ้ำและหลอม ตรวจของไม่ซ้ำ/หาย

### 5.4 Crops, Food & Drinks

5 mods

- AlcoCraft+ — Food `[blocked]`
- EpheroLib — Uncategorized `[blocked]`
- Croptopia — Uncategorized `[blocked]`
- Bread Variants — Adventure
- Golden Foods! — Adventure `[blocked]`

**Priority:** P1 · **ทดสอบ:** ปลูก เก็บเกี่ยว คราฟต์อาหาร/เครื่องดื่มและตรวจ buff

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Architectury API, MonoLib

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** AlcoCraft+ → EpheroLib → Croptopia → Bread Variants → MonoLib → Golden Foods!

### 5.5 Crop Storage Addon

1 mod

- Crate Delight: Croptopia — Adventure `[blocked]`

**Priority:** P2 · **ทดสอบ:** คราฟต์ crate/bag และแปลงคืน ต้องมี Crate Delight ที่ขาดก่อน

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Crate Delight

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Crate Delight → Crate Delight: Croptopia

### 5.6 Farming & Kitchen

5 mods

- Cooking for Blockheads — Decoration
- Farming for Blockheads — Food
- XP From Harvest — Game Mechanics
- Accelerated Decay — Game Mechanics
- Omni Pots — Uncategorized `[blocked]`

**Priority:** P1 · **ทดสอบ:** ทดสอบครัว เมล็ดพืช XP เก็บเกี่ยวและระบบกระถาง

### 5.7 Villagers & Trading

3 mods

- Trade Cycling — Utility
- More Villagers — Uncategorized `[blocked]`
- Easy Villagers — Technology

**Priority:** P1 · **ทดสอบ:** ซื้อขาย เปลี่ยนอาชีพ/ข้อเสนอ ตรวจราคาและโหลดโลกกลับ

### 5.8 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–5 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 6 — Building, Furniture & Decoration

18 mods

รวมของก่อสร้างและตกแต่งไว้ใน Batch เดียว; ลง library ก่อน content ที่เรียกใช้

**new_mods:** 18 · **inherited_mods:** 123 · **สะสมจากรายชื่อเดิมตามแผน:** 141

### 6.1 Building Tools & Materials

7 mods

- Moonlight Lib — Library
- Measurements — Uncategorized `[blocked]`
- Construction Wands Revived — Other
- Sawmill — Other
- Stoneworks — Decoration
- New Slab Variants — Decoration `[blocked]`
- More Useful Copper — Adventure `[blocked]`

**Priority:** P1 · **ทดสอบ:** วาง/ทุบบล็อก ใช้ wand/sawmill และตรวจสูตรวัสดุ

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** MonoLib

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Moonlight Lib → Measurements → Construction Wands Revived → Sawmill → Stoneworks → New Slab Variants → More Useful Copper

### 6.2 Furniture

4 mods

- Macaw's Lights and Lamps — Decoration
- Macaw's Furniture — Decoration
- MrCrayfish's Furniture Mod: Refurbished — Cosmetic `[blocked]`
- MrCrayfish's Furniture Mod Tools: Refurbished — Decoration

**Priority:** P2 · **ทดสอบ:** ใช้เฟอร์นิเจอร์ ระบบไฟ/เครื่องใช้และบันทึกหลัง reconnect

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Framework

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Macaw's Lights and Lamps → Macaw's Furniture → Framework → MrCrayfish's Furniture Mod: Refurbished → MrCrayfish's Furniture Mod Tools: Refurbished

### 6.3 Art, Displays & Seasonal Decor

3 mods

- Macaw's Holidays — Uncategorized `[blocked]`
- Dream Displays — Game Mechanics
- Immersive Paintings — Decoration `[blocked]`

**Priority:** P2 · **ทดสอบ:** อัปโหลดภาพ/ใช้ display ตรวจสิทธิ์และการแสดงผลของผู้เล่นอื่น

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Fzzy Config

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Macaw's Holidays → Dream Displays → Kotlin for Forge → Fzzy Config → Immersive Paintings

### 6.4 Music & Ambient Decoration

2 mods

- Immersive Melodies — Equipment
- Chimes — Decoration

**Priority:** P2 · **ทดสอบ:** เล่นดนตรี/เสียงพร้อมกัน ตรวจระยะเสียงและ reconnect

### 6.5 Shared Workstations

2 mods

- Open Together — Utility
- Visual Workbench — Utility

**Priority:** P1 · **ทดสอบ:** เปิดใช้งานร่วมกัน คราฟต์และตรวจ sync ของผู้เล่นสองคน

### 6.6 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–6 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 7 — Creatures, Combat, Equipment & Difficulty

45 mods

เพิ่มม็อบทีละกลุ่ม แล้วตรวจการต่อสู้/อุปกรณ์ ก่อนปรับความยาก

**new_mods:** 45 · **inherited_mods:** 141 · **สะสมจากรายชื่อเดิมตามแผน:** 186

### 7.1 Combat Test Foundation

1 mod

- MmmMmmMmmMmm — Utility

**Priority:** P0 · **ทดสอบ:** ใช้หุ่นฝึกบันทึก damage baseline และผลเกราะ

### 7.2 Combat & Dodge

3 mods

- Player Animation Library — Library
- Better Combat — Adventure
- Combat Roll — Adventure

**Priority:** P1 · **ทดสอบ:** โจมตี กลิ้ง หลบและตรวจ sync ใน multiplayer

### 7.3 Equipment & Accessories

4 mods

- Artifacts — Adventure
- Immersive Armors — Equipment
- Elytra Slot — Uncategorized `[blocked]`
- Transmog — Utility

**Priority:** P1 · **ทดสอบ:** ใส่/ถอด accessory เกราะ elytra และตาย/กู้ไอเทม

### 7.4 Ecology & Friends

5 mods

- Ecologics — Food
- Resourceful Lib — Library
- Friends&Foes (Forge/NeoForge) — Adventure
- Friends&Foes - Flowery Mooblooms (Forge/NeoForge) — Adventure
- Friends&Foes - Beekeeper Hut (Forge/NeoForge) — Worldgen

**Priority:** P1 · **ทดสอบ:** ตรวจการเกิด การโต้ตอบและโครงสร้างในโลกใหม่/เพิ่ม chunk ใหม่

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 7.5 Creature Variety

5 mods

- Variants&Ventures — Adventure
- Bagus Lib — Library
- Sea Life — Mobs
- EarthMobs — Mobs
- Tiny Skeletons — Adventure

**Priority:** P1 · **ทดสอบ:** spawn ม็อบทีละชนิด ตรวจ AI drops และจำนวน entity

### 7.6 Animal Farming

2 mods

- Animal Feeding Trough — Adventure
- Animal Pens — Decoration

**Priority:** P1 · **ทดสอบ:** ให้อาหาร เลี้ยง/เก็บสัตว์ ตรวจจำนวนและโหลดโลกกลับ

### 7.7 Alex Mobs Foundation

2 mods

- Alex's Mobs (NeoForge) — Adventure `[blocked]`
- Citadel (NeoForge) — API and Library `[blocked]`

**Priority:** P1 · **ทดสอบ:** ตรวจไฟล์/loader และ dependency ก่อน spawn/AI/drop

### 7.8 Animal Garden

12 mods

- Animal Garden - Spectacled Bear — Mobs `[blocked]`
- Aquarius Libs — Other
- Animal Garden - Bull Shark — Mobs
- Animal Garden - Common Raccoon — Mobs
- Animal Garden - Crocodile — Mobs
- Animal Garden - Hippopotamus — Mobs
- Animal Garden - Lion — Mobs
- Animal Garden - Narwhal — Mobs
- Animal Garden - Owl — Decoration
- Animal Garden - Red Panda — Mobs
- Animal Garden - Sea Otter — Mobs
- Animal Garden - Western Gorilla — Mobs

**Priority:** P2 · **ทดสอบ:** เพิ่มสัตว์ทีละ 2–3 ชนิด ตรวจ spawn AI และฟาร์ม; วัดภาระ entity จริง

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 7.9 Hostile & Elite Encounters

5 mods

- Mutant Monsters — Mobs
- Mutants and Zombies — Adventure
- Armored Foes — Equipment
- Aggro Indicator — Utility
- Champions-Unofficial — Adventure `[blocked]`

**Priority:** P1 · **ทดสอบ:** ต่อสู้ ตรวจเกราะ/ความสามารถ/loot และจำนวนศัตรู

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Architectury API

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Mutant Monsters → Mutants and Zombies → Armored Foes → Aggro Indicator → Champions-Unofficial

### 7.10 Difficulty & Despawn Tuning

4 mods

- Armor & damage scaling — Uncategorized `[blocked]`
- Configurable Despawn Timer — Game Mechanics
- Dusk — Server Utility `[blocked]`
- Dynamic Difficulty — Uncategorized `[blocked]`

**Priority:** P1 · **ทดสอบ:** เปลี่ยนค่าทีละตัว ทดสอบช่วงเวลา/ระยะทางตามคุณสมบัติจริงของรุ่นที่เลือก

### 7.11 Multiplayer Revival

2 mods

- CreativeCore — Library
- PlayerRevive — Adventure

**Priority:** P1 · **ทดสอบ:** ล้ม ชุบชีวิต ตายเต็มรูปแบบและ reconnect; ตรวจ corpse/accessories ไม่ซ้ำ

### 7.12 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–7 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 8 — Skills, Attributes, Enchanting & Apotheosis

15 mods

ปรับ progression หลังมี baseline combat; ตรวจเส้นทางเพิ่มพลังและช่องทาง farm loot

**new_mods:** 15 · **inherited_mods:** 186 · **สะสมจากรายชื่อเดิมตามแผน:** 201

### 8.1 Attributes & Health

3 mods

- Prickle — Library
- AttributeFix — Utility
- Max Health Fix — Adventure `[blocked]`

**Priority:** P0 · **ทดสอบ:** ตรวจเพดาน attribute/หัวใจและ HUD ที่ติดตั้งแล้ว

### 8.2 Skill Progression

3 mods

- Pufferfish's Attributes — Game Mechanics
- Pufferfish's Skills — Adventure
- Default Skill Trees — Adventure

**Priority:** P1 · **ทดสอบ:** รับ XP อัปสกิล reset และตรวจหลัง reconnect

### 8.3 Enchant Information

1 mod

- Enchantment Descriptions — Magic

**Priority:** P1 · **ทดสอบ:** ตรวจคำอธิบาย enchant และข้อมูลของอุปกรณ์จริง

### 8.4 Apothic Foundation

3 mods

- Apothic Attributes — Adventure
- Apothic Enchanting — Adventure
- Dis-Enchanting Table — Adventure

**Priority:** P1 · **ทดสอบ:** ทดสอบระบบ enchanting และถอน enchant ตรวจต้นทุน/ผลลัพธ์

### 8.5 Enchanting Alternatives

1 mod

- Enchanting Infuser — Equipment

**Priority:** P2 · **ทดสอบ:** เทียบกับ Apothic Enchanting และเลือกบทบาท/ต้นทุนที่ไม่ข้าม progression

### 8.6 Spawners & Apotheosis

4 mods

- Apotheosis Totem — Adventure
- Apothic Spawners — Adventure
- Patchouli — Library
- Apotheosis — Adventure

**Priority:** P1 · **ทดสอบ:** ทดสอบ spawner อุปกรณ์ affix/loot และ addon หลัง parent พร้อม

### 8.7 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–8 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 9 — Magic & RPG Classes

18 mods

ทดสอบฐานเวท คลาส และอุปกรณ์หลังระบบ combat/attributes พร้อม

**new_mods:** 18 · **inherited_mods:** 201 · **สะสมจากรายชื่อเดิมตามแผน:** 219

### 9.1 Spell Foundation

2 mods

- Spell Power Attributes — Library
- Spell Engine — Game Mechanics

**Priority:** P0 · **ทดสอบ:** ตรวจคาถาพื้นฐาน scaling และ sync client/server

### 9.2 Runes & Supporting APIs

4 mods

- Bundle API — Game Mechanics
- Runes — Magic
- Armor Model API — Equipment
- Structure Pool API — Library

**Priority:** P0 · **ทดสอบ:** ตรวจ rune/API ก่อนเพิ่มแต่ละคลาส

### 9.3 Wizards & Healers

2 mods

- Wizards (RPG Series) — Adventure
- Paladins & Priests (RPG Series) — Adventure

**Priority:** P1 · **ทดสอบ:** ร่ายเวท ฮีล buff และผลกับเพื่อนในทีม

### 9.4 Ranged & Melee Classes

3 mods

- Ranged Weapon API — Equipment
- Archers (RPG Series) — Adventure
- Rogues & Warriors (RPG Series) — Adventure

**Priority:** P1 · **ทดสอบ:** ยิง/โจมตีและตรวจการทำงานกับ Better Combat

### 9.5 RPG Equipment

4 mods

- Jewelry (RPG Series) — Adventure
- Relics (RPG Series) — Adventure
- Arsenal (RPG Series) — Adventure
- Armory (RPG Series) — Adventure

**Priority:** P1 · **ทดสอบ:** ใส่อุปกรณ์/เครื่องประดับ ตรวจ scaling และการตาย

### 9.6 RPG Structures & Enchants

3 mods

- Gazebos (RPG Series) — Adventure
- Village Taverns (RPG Series) — Adventure
- RPG Enchantments — Adventure

**Priority:** P1 · **ทดสอบ:** สร้างโลกใหม่หรือ chunk ใหม่ ตรวจโครงสร้าง loot และ enchant

**โลกทดสอบ:** ใช้โลกใหม่เพิ่มเติมสำหรับ world generation/registry; เก็บโลกสะสมเดิมไว้ตรวจ regression อย่าคาดหวังให้เนื้อหาใหม่ปรากฏใน chunk ที่สร้างแล้ว

### 9.7 Integration

0 mods

**สถานะ:** `not_run` · ทดสอบชุดสะสม Batch 1–9 ก่อนเดินหน้าต่อ แก้ critical issue และทำ checkpoint เมื่อผ่านจริง

## Batch 10 — Quests, Jobs, Customization & Final Integration

13 mods

รวม progression ผู้เล่น สคริปต์และภาพเสริมท้ายแผน แล้วทดสอบแพ็กเต็ม 3–6 คน

**new_mods:** 13 · **inherited_mods:** 219 · **สะสมจากรายชื่อเดิมตามแผน:** 232

### 10.1 Jobs & Origins Foundation

6 mods

- Knot — Library
- UI Lib — Library
- YAML Config — Library
- Neo Origins — Game Mechanics
- Jobs+ — Adventure `[blocked]`
- Jobs+ Tools — Equipment

**Priority:** P1 · **ทดสอบ:** ตรวจ dependency งาน/อาชีพ origins สิทธิ์และ reset progression

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Arc Lib, Item Restrictions

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Knot → UI Lib → YAML Config → Neo Origins → Arc Lib → Item Restrictions → Jobs+ → Jobs+ Tools

### 10.2 Quests, Books & Player Activities

4 mods

- Paper Books — Utility
- Starcatcher — Adventure
- FTB Quests — Server Utility `[blocked]`
- Little Joys — Game Mechanics

**Priority:** P1 · **ทดสอบ:** ทดสอบเควสต์ รางวัล ทีม หนังสือ/กิจกรรมและข้อมูลหลัง restart

### 10.3 Scripts & Loot Integration

2 mods

- KubeJS — Library `[blocked]`
- LootJS: KubeJS Addon — Utility `[blocked]`

**Priority:** P1 · **ทดสอบ:** โหลดสคริปต์และทดสอบ recipe/loot; ตรวจ rewards ไม่ซ้ำกับ quests

**Dependency ที่ไม่มีในไฟล์ (ยังไม่เพิ่มในจำนวน mods):** Better Advanced Tooltips, Rhino

ตรวจ exact version และ embedded library ก่อน; ติดตั้ง required dependencies ใน Step นี้ก่อนม็อดที่เรียกใช้ หรือยืนยันว่ามีใน Step ก่อนหน้าแล้ว

**ลำดับติดตั้งที่เสนอเมื่อ resolve ครบ (รวม dependency ที่ต้องตรวจเพิ่ม):** Rhino → Better Advanced Tooltips → KubeJS → LootJS: KubeJS Addon

### 10.4 Optional Shaders

1 mod

- Iris Shaders — Decoration

**Priority:** P2 · **ทดสอบ:** เปิด shader ภายหลัง baseline ตรวจภาพ/FPS และการต่อสู้ในแพ็กเต็ม

### 10.5 Final Multiplayer Integration

0 mods

**Priority:** P0 · **ทดสอบ:** ผู้เล่น 3–6 คน สำรวจ ต่อสู้ ฟาร์ม คราฟต์ quests ตาย/ชุบชีวิต restart และตรวจ save/config

**Final gate:** ทดสอบ multiplayer 3–6 คนทั้งโลกสะสมและโลกใหม่หลังเลือก worldgen ครบ ตรวจ combat/skills/classes/quests/farming/loot/death/revival และ restore บนสำเนา; ยัง `not_run` และห้ามผ่าน gate หากมี required requirement ค้างในชุดที่จะติดตั้ง

## Dependency & Verification Notes

**สถานะความสัมพันธ์:** `required`, `optional`, `incompatible`, `unknown` แยกใน graph; การไม่พบข้อมูล incompatible ไม่ได้แปลว่ายืนยันเข้ากันได้ ข้อมูล required ที่ขาดเป็นหลักฐานว่าไม่มีแถวในไฟล์นี้ ไม่ใช่ข้อยืนยันว่า launcher ไม่ได้ embed มาให้

| Dependency ที่ไม่มีแถวในไฟล์ | ผู้เรียกใช้ที่ตรวจพบ                                                                                        | หลักฐาน                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arc Lib                      | Jobs+, Item Restrictions                                                                                    | [source 1](https://modrinth.com/mod/jobsplus/version/j8e0bLhO) · [source 2](https://modrinth.com/mod/item-restrictions/version/zqNy7nje)                                                                                                                                                                                                                                                                                                                                                     |
| Architectury API             | Roughly Enough Items (REI), Achievements Optimizer, AlcoCraft+, Champions-Unofficial, FTB Teams, FTB Chunks | [source 1](https://modrinth.com/mod/rei/version/isd1MxO2) · [source 2](https://modrinth.com/mod/achievements-optimizer/version/hK5jDfqJ) · [source 3](https://modrinth.com/mod/alcocraft/version/Hx8rhREg) · [source 4](https://modrinth.com/mod/champions-unofficial/version/DsaWbD4Z) · [source 5](https://www.curseforge.com/minecraft/mc-mods/ftb-teams-forge/relations/dependencies) · [source 6](https://www.curseforge.com/minecraft/mc-mods/ftb-chunks-forge/relations/dependencies) |
| Better Advanced Tooltips     | KubeJS                                                                                                      | [source 1](https://modrinth.com/mod/kubejs/version/7Vil8vwK)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Better Library               | Underground Village, Stoneholm                                                                              | [source 1](https://modrinth.com/mod/underground-village-stoneholm/version/IZ5UAURT)                                                                                                                                                                                                                                                                                                                                                                                                          |
| Crate Delight                | Crate Delight: Croptopia                                                                                    | [source 1](https://modrinth.com/mod/crate-delight-croptopia/version/WQNukyXL)                                                                                                                                                                                                                                                                                                                                                                                                                |
| Framework                    | MrCrayfish's Furniture Mod: Refurbished                                                                     | [source 1](https://mrcrayfish.com/mods/refurbished_furniture)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Fzzy Config                  | Immersive Paintings                                                                                         | [source 1](https://modrinth.com/mod/immersive-paintings/version/uFeTHh2F)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Iceberg                      | Legendary Tooltips, Item Borders, Item Highlighter                                                          | [source 1](https://modrinth.com/mod/legendary-tooltips/version/ZaJ1nyhV) · [source 2](https://modrinth.com/mod/item-borders/version/TSwH97aN) · [source 3](https://modrinth.com/mod/item-highlighter/version/v0BjmZl8)                                                                                                                                                                                                                                                                       |
| Immersive Overlays           | Field Guide                                                                                                 | [source 1](https://modrinth.com/mod/field-guide/version/heiSVSkV)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Item Restrictions            | Jobs+                                                                                                       | [source 1](https://modrinth.com/mod/jobsplus/version/j8e0bLhO)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Kotlin for Forge             | Fzzy Config                                                                                                 | [source 1](https://modrinth.com/mod/fzzy-config/version/HXARGQ9W)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Loot Integrations            | Yung Structures Addon for Loot Integrations                                                                 | [source 1](https://www.curseforge.com/minecraft/mc-mods/yung-structures-addon-for-loot-integrations)                                                                                                                                                                                                                                                                                                                                                                                         |
| MezzConfig                   | Just Enough Items (JEI)                                                                                     | [source 1](https://modrinth.com/mod/jei/version/NiYfNYIM)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| MonoLib                      | New Slab Variants, Golden Foods!                                                                            | [source 1](https://modrinth.com/mod/new-slab-variants/version/ZkYqRXxd) · [source 2](https://modrinth.com/mod/golden-foods/version/l58V0aH1)                                                                                                                                                                                                                                                                                                                                                 |
| Rhino                        | KubeJS                                                                                                      | [source 1](https://modrinth.com/mod/kubejs/version/7Vil8vwK)                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**รายการที่ยังยืนยันรุ่น/dependency ไม่ครบ:**

- Roughly Enough Items (REI): ไม่มีในรายชื่อไฟล์นี้: Architectury API; ตรวจ standalone/embedded และรุ่นก่อน
- Cupboard: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Clumps: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Achievements Optimizer: ไม่มีในรายชื่อไฟล์นี้: Architectury API; ตรวจ standalone/embedded และรุ่นก่อน
- Legendary Tooltips: ไม่มีในรายชื่อไฟล์นี้: Iceberg; ตรวจ standalone/embedded และรุ่นก่อน
- Item Borders: ไม่มีในรายชื่อไฟล์นี้: Iceberg; ตรวจ standalone/embedded และรุ่นก่อน
- Durability Tooltip: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Item Highlighter: ไม่มีในรายชื่อไฟล์นี้: Iceberg; ตรวจ standalone/embedded และรุ่นก่อน
- Just Enough Items (JEI): ไม่มีในรายชื่อไฟล์นี้: MezzConfig; ตรวจ standalone/embedded และรุ่นก่อน
- Recall Potion: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Field Guide: ไม่มีในรายชื่อไฟล์นี้: Immersive Overlays; ตรวจ standalone/embedded และรุ่นก่อน
- Overloaded Armor Bar: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Sit: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- AlcoCraft+: ไม่มีในรายชื่อไฟล์นี้: Architectury API; ตรวจ standalone/embedded และรุ่นก่อน
- FTB Teams: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้; ไม่มีในรายชื่อไฟล์นี้: Architectury API; ตรวจ standalone/embedded และรุ่นก่อน; รอ required dependency: FTB Library
- Iron Furnaces: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- FTB Library: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Sophisticated Tab: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Crafting Tweaks: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- More Tier Upgrade: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Polymorph+: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- EpheroLib: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Croptopia: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Crate Delight: Croptopia: ไม่มีในรายชื่อไฟล์นี้: Crate Delight; ตรวจ standalone/embedded และรุ่นก่อน
- FTB Ultimine: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- FTB Chunks: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้; ไม่มีในรายชื่อไฟล์นี้: Architectury API; ตรวจ standalone/embedded และรุ่นก่อน; รอ required dependency: FTB Library; รอ required dependency: FTB Teams
- Underground Village, Stoneholm: ไม่มีในรายชื่อไฟล์นี้: Better Library; ตรวจ standalone/embedded และรุ่นก่อน
- When Dungeons Arise: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Yung Structures Addon for Loot Integrations: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้; ไม่มีในรายชื่อไฟล์นี้: Loot Integrations; ตรวจ standalone/embedded และรุ่นก่อน
- Armor & damage scaling: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Max Health Fix: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- LootJS: KubeJS Addon: รอ required dependency: KubeJS
- KubeJS: ไม่มีในรายชื่อไฟล์นี้: Rhino; ตรวจ standalone/embedded และรุ่นก่อน; ไม่มีในรายชื่อไฟล์นี้: Better Advanced Tooltips; ตรวจ standalone/embedded และรุ่นก่อน
- More Villagers: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Alex's Mobs (NeoForge): ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Animal Garden - Spectacled Bear: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Citadel (NeoForge): ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Dusk: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Dynamic Difficulty: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Champions-Unofficial: ไม่มีในรายชื่อไฟล์นี้: Architectury API; ตรวจ standalone/embedded และรุ่นก่อน
- Measurements: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Macaw's Holidays: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- MrCrayfish's Furniture Mod: Refurbished: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้; ไม่มีในรายชื่อไฟล์นี้: Framework; ตรวจ standalone/embedded และรุ่นก่อน
- Omni Pots: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- New Slab Variants: ไม่มีในรายชื่อไฟล์นี้: MonoLib; ตรวจ standalone/embedded และรุ่นก่อน
- More Useful Copper: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Immersive Paintings: ไม่มีในรายชื่อไฟล์นี้: Fzzy Config; ตรวจ standalone/embedded และรุ่นก่อน
- Golden Foods!: ไม่มีในรายชื่อไฟล์นี้: MonoLib; ตรวจ standalone/embedded และรุ่นก่อน
- Elytra Slot: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- FTB Quests: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้; รอ required dependency: FTB Library; รอ required dependency: FTB Teams
- Jobs+: ไม่มีในรายชื่อไฟล์นี้: Arc Lib; ตรวจ standalone/embedded และรุ่นก่อน; ไม่มีในรายชื่อไฟล์นี้: Item Restrictions; ตรวจ standalone/embedded และรุ่นก่อน
- FTB Backups 3: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Chunky: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้
- Dynamic View and Simulation Distances: ยังไม่ยืนยัน exact release / loader / dependencies ของ target จากแหล่งที่ตรวจได้

**Dependency cycle:** ไม่พบใน required references ที่ resolve ได้; ความสัมพันธ์ unknown ยังตรวจไม่ครบ

**ลำดับที่ปรับตาม dependency:**

- Puzzles Lib: 6.1 → 2.7 ก่อน Health Bars
- Moonlight Lib: 7.1 → 6.1 ก่อน Sawmill
- YetAnotherConfigLib (YACL): 6.3 → 2.6 ก่อน Loot Journal: Pickup Notifier
- Fragmentum: 10.2 → 2.6 ก่อน Loot Journal: Pickup Notifier

## Cleanup Review

คำแนะนำเป็นการเลือกขอบเขตแพ็ก แยกจาก verified compatibility; ไม่ลบม็อดให้อัตโนมัติ ทุกตัวมี keep/review/remove_candidate และรายชื่อ dependents ใน mod-cleanup-report.md

| ตัวที่ควรพิจารณาก่อน       | สถานะ            | เหตุผล                                                                                                                   |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Roughly Enough Items (REI) | remove_candidate | ซ้อนบทบาท recipe browser กับ JEI ที่เลือกเป็นแกน และมี addon Sophisticated JEI Index; เลือก browser หลักก่อน             |
| libIPN                     | remove_candidate | ในไฟล์นี้ไม่มี Inventory Profiles Next ซึ่งเป็นเหตุผลใช้ libIPN ที่ต้องตรวจ; เก็บไว้รอ manifest ไม่ต้องลง library เดี่ยว |
| MossyLib                   | remove_candidate | ยังไม่พบ required dependent ในกราฟที่ตรวจได้; ตรวจ manifest ของรายการที่ unresolved ก่อนตัดออก                           |
| Trinkets Updated           | remove_candidate | เป็น accessory API เพิ่มเติม; ยังไม่พบ required dependent ในแพ็กที่ตรวจได้ ให้ใช้ Curios ตาม mods ที่เรียกใช้ก่อน        |
| Enchanting Infuser         | remove_candidate | เพิ่มช่องทาง enchanting อีกชุดร่วมกับ Apothic Enchanting/Apotheosis; พิจารณาไม่ใช้หากต้องการ progression เดียว           |

กลุ่มควร review ร่วมกัน: Storage Drawers / Sophisticated Storage / Tom’s Storage, Health Bars / Overflowing Bars / Overloaded Armor Bar, Apothic Enchanting / Enchanting Infuser / Dis-Enchanting Table, Jobs+ / Pufferfish’s Skills / Neo Origins และระบบการค้า/รางวัล รายการเหล่านี้อาจมีบทบาทเสริมกัน จึงไม่สรุปว่า redundant ทุกตัว

ความเสี่ยงด้าน performance ของ worldgen, ม็อบ/AI, animal pens, spawners และ rendering เป็นสมมติฐานที่ต้องวัดจริง ยังไม่มี benchmark/FPS/TPS หรือผล runtime passed/failed

**Other ของ Batch 1:** เป็นจุดพักเพียงจุดเดียวสำหรับม็อดนอกแผนหลัก การอยู่ใน Other ไม่ได้หมายความว่าต้องลงก่อน; หากเลือก Chunky ให้ pre-generate หลัง worldgen ทั้ง Batch 4, 7 และ 9 ครบแล้ว หากเลือก Dynamic View ให้เปรียบเทียบหลังชุดเต็มมี baseline และตรวจ Cupboard/manifest ก่อน

## Output Validation

- Source entries: 248 · unique names: 241 · primary assignments: 241 · Batch headings: 10
- ชื่อ/หมวดต้นฉบับคงไว้ทุกตัว รวมแถวซ้ำเป็นจุดติดตั้งครั้งเดียวและเก็บ source occurrence ทั้งหมดใน audit/corrected JSON
- ตรวจ coverage, ไม่มี primary assignment ซ้ำ, reference ของ graph, dependency order หรือ unresolved block, JSON syntax และ ZIP integrity ด้วย static validation เท่านั้น
- Missing dependencies เป็นข้อเสนอที่ต้องตรวจ ไม่ถูกเพิ่มเงียบ ๆ ในรายการต้นฉบับหรือจำนวนสะสม
- ทุก planned runtime test เป็น not_run หรือ blocked; จำนวนสะสมเป็นจำนวน candidate ตามแผน ไม่ใช่จำนวนที่ติดตั้ง/ผ่านแล้ว
