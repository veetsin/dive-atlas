# B1 · 定稿风格批（第一张图）

**怎么用**
1. ChatGPT 里任意聊天模型都行（出图都是 Images 2.5）。新开一个对话。
2. **附上 `art/palette-swatch.png`**（色板，它就是 prompt 里说的 input 1）。
3. 画幅选择器选 **3:2 横版**（不要靠文字描述比例）。
4. 把下面三段（STYLE → LAYOUT → B1）**一起**粘贴，一字不改，发送。
5. 下载 PNG 原图（不要截图），确认像素 ≥ 1536×1024，四角都是同一种平灰，中线十字上没有压到任何主体，图里没有任何文字。
6. 存到 `art/raw/batch-01/grid.png`，然后告诉我"B1 存好了"。

某一格不满意：对那张图用局部编辑说 "redraw only the top-right subject as …; keep the other three unchanged"，不要整张重画。

---

```
STYLE — apply identically to every subject in every image of this set:
Refined flat vector illustration, sticker-sheet quality, like shapes cut from matte paper.
Clean geometric shapes with smooth curves. No outlines anywhere. Every form is built from
exactly two flat tones: a base colour and one slightly darker shade on its lower-right side,
because the light comes from the upper left. Colour fills are perfectly flat, smooth and
grain-free, with crisp edges.
Palette = the attached swatch sheet (input 1): deep navy, lagoon teal, pale seafoam green,
warm coral orange-red, soft sun yellow, pale sand, shell pink, warm off-white. Paint each
animal's real colours using the nearest swatch colours only.
Anatomy is accurate and species-specific, the way a marine biologist would draw it: natural
proportions, small eyes in natural proportion, closed neutral mouths, calm natural posture.
Gently stylised, calm and elegant — a museum natural-history poster.
Every subject's head points to the right edge of the image. Fish, sharks, whales, dolphins,
turtles and mammals are shown in full side profile; rays are shown from directly above with
the head to the right.
Each subject floats alone with empty background around it: no water, no bubbles, no seabed,
no cast shadow, no drop shadow, no frame, no border, no text, no letters, no numbers,
no labels, no captions, no watermark.
BACKGROUND: one single flat, uniform, untextured light grey (about #E6E6E6, a plain pale grey
slightly lighter than a shark's belly) covering the whole canvas edge to edge, with no gradient,
no vignette and no visible panel dividers.

LAYOUT: one image divided into an invisible 2x2 grid of four equal cells. One subject per cell,
centred in its cell, filling about 70% of the cell's width or height, whichever is tighter.
Keep at least 10% empty margin inside every cell; no part of any subject touches or crosses
the invisible cell boundaries, and no subject overlaps another. Do not draw the grid lines.
All four subjects share exactly the same rendering style, shading depth and level of detail.

Top-left — Whale shark (Rhincodon typus): very broad flattened head with the mouth right at the
front tip; long body with three raised ridges along each flank; slate blue-grey back covered in
a regular checkerboard of pale spots and thin pale vertical bars; off-white belly; tall crescent
tail with a much longer upper lobe; gliding straight ahead.
Top-right — Reef manta ray (Mobula alfredi), seen from directly above, head to the right: wide
diamond with broad triangular wings, wingtips slightly curled; two paddle-shaped head fins rolled
into tubes in front of a wide straight mouth; charcoal back with two pale Y-shaped shoulder
patches; short slim tail ending in a plain point; wings fully spread.
Bottom-left — Green sea turtle (Chelonia mydas): smooth oval shell with large flat scutes lying
edge to edge; rounded head with a blunt beak; large flat front flippers angled in mid-stroke,
short hind flippers; shell olive-brown with radiating amber streaks, limbs olive, underside
pale sand.
Bottom-right — Nudibranch (Chromodoris annae): slender slug crawling to the right; royal-blue
back finely speckled with black, edged by a thin black line and then an orange-yellow mantle
rim; two orange club-shaped rhinophores at the front; a plume of orange gills near the rear.
```

---

**B1 通过后的下一批（B2，礁鲨，3:2）**：在 STYLE 和 LAYOUT 之间加一段 ANCHOR，并同时附上色板图（input 1）和通过验收的 B1 原图（input 2）：

```
Input 1 is the palette swatch sheet. Input 2 is the approved style reference from this same
sticker set: match its rendering style, shape language, shading depth and palette exactly,
and draw the new animals listed below in that style. Do not copy the animals in input 2.
```

B2–B7 和装饰 D1、D2 的四行描述都在 `docs/ILLUSTRATION_GUIDE.md` §3.3。
