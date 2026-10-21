# 插画规范与 GPT 出图手册

版本 0.2 · 2026-10-20 · 按 ChatGPT Images 2.5 与本机流水线实测修订

目标：所有贴纸看起来出自同一位插画师之手；放在地图上 64–96 px 时依然可辨认物种；放大到卡片 240 px 时经得起细看。

> 出图在 **ChatGPT 网页/App（Plus 订阅）** 里做。图像由 ChatGPT Images 2.5 生成，和你在模型菜单里选的聊天模型（GPT-6 / GPT-5.6 …）无关，不必为画图切换或升级模型。
> 每次生成都附两张参考图：**输入 1 = `art/palette-swatch.png`（色板）**，第二批起 **输入 2 = 通过验收的第一批宫格图**。

---

## 1. 风格总纲（每次出图都放在 prompt 最前面，一字不改）

两个版本只差最后一段 BACKGROUND。**默认用 STYLE-G**（灰底 → 脚本抠图，结果可控）；STYLE-T 每批最多试一次，按 §5 验证是真透明才用。

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
```

STYLE-G 结尾加：
```
BACKGROUND: one single flat, uniform, untextured light grey (about #E6E6E6, a plain pale grey
slightly lighter than a shark's belly) covering the whole canvas edge to edge, with no gradient,
no vignette and no visible panel dividers.
```

STYLE-T 结尾加：
```
BACKGROUND: output a PNG with a genuinely transparent background (alpha channel). Isolated
subjects only: no scenery, no solid backdrop, no checkerboard pattern, no shadow — the area
around the subjects is empty transparency.
```

为什么这样写（和 0.1 版的区别）：
- **不写 hex 色值**：图像模型不会按 hex 还原，反而可能把字符串画进图里。颜色用词 + 色板图锚定；精确色值由代码里的 CSS 变量保证。
- **不写颗粒 / risograph**：模型画的颗粒在 192 px 下只剩噪点，WebP 体积翻 2–3 倍（实测），还会弄脏抠图边缘；纸张颗粒改由代码全局叠一层（见 SPEC §5.4）。"Risograph" 也是品牌名。
- **只说要什么，不说"没有 X"**：否定句（"白鳍不存在""不要笑脸"）模型常常反向执行。所有物种描述都写成肯定句。
- **朝向规则明确到视角**：侧视物种头朝右，魟/蝠鲼俯视头朝右，不再冲突。
- **不在代码里镜像贴纸**：镜像后光源变成右上，96 px 下看得出是"另一批"。需要朝左的就单独画。

---

## 2. 保持风格统一的铁律

1. **宫格出图**：一次 2×2 四个主体。同一次生成的画风天然一致，跨批次差异才是问题。
2. **双参考锚定**：每次都附色板图（输入 1）；第二批起再附通过验收的第一批宫格（输入 2）并加 ANCHOR 段。
3. **固定规则不改**：STYLE 一字不改。想调风格就回到第一批重做，不在中途改。
4. **画幅在比例选择器里选**，不靠文字：长条形物种批次选 **3:2 横版**，高/圆形物种批次选 **1:1**（见 §3.3 每批标注）。下载后确认像素 ≥ 1536×1024（3:2）或 ≥ 1024×1024（1:1），小于就重生成。
5. **出错只补一格**：某格不合格，用 ChatGPT 的局部编辑（"redraw only the top-right subject as …; keep the other three unchanged"），不要整张重画。

---

## 3. Prompt 模板

组装顺序：`STYLE-G（或 -T）` + `ANCHOR（第二批起）` + `LAYOUT` + 四行物种描述。

### 3.1 LAYOUT（紧跟 STYLE）

```
LAYOUT: one image divided into an invisible 2x2 grid of four equal cells. One subject per cell,
centred in its cell, filling about 70% of the cell's width or height, whichever is tighter.
Keep at least 10% empty margin inside every cell; no part of any subject touches or crosses
the invisible cell boundaries, and no subject overlaps another. Do not draw the grid lines.
All four subjects share exactly the same rendering style, shading depth and level of detail.
```

### 3.2 ANCHOR（第二批起，附输入 1 色板 + 输入 2 第一批宫格）

```
Input 1 is the palette swatch sheet. Input 2 is the approved style reference from this same
sticker set: match its rendering style, shape language, shading depth and palette exactly,
and draw the new animals listed below in that style. Do not copy the animals in input 2.
```

### 3.3 批次计划（27 个物种 + 2 张装饰，9 次生成）

描述统一按"轮廓 → 花纹 → 颜色 → 姿态"写，带拉丁学名，只用肯定句。切图 id 顺序 = 左上、右上、左下、右下。

**B1 — 定稿风格（3:2 横版；只附输入 1）** · ids: `whale-shark,reef-manta,green-turtle,nudibranch`
```
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

**B2 — 礁鲨（3:2）** · ids: `grey-reef-shark,whitetip-reef-shark,galapagos-shark,tiger-shark`
```
Top-left — Grey reef shark (Carcharhinus amblyrhynchos): medium, moderately stout reef shark;
short blunt rounded snout; first dorsal fin plain mid-grey; tail fin with a broad black band
along its entire rear edge; dusky pectoral tips; grey back, white belly; cruising level.
Top-right — Whitetip reef shark (Triaenodon obesus): slender shark with a short, broad, flattened
snout and small oval eyes; brownish-grey back, pale belly; bright white tips on the first dorsal
fin and on the upper lobe of the tail; low second dorsal fin; relaxed cruising pose.
Bottom-left — Galapagos shark (Carcharhinus galapagensis): large stout shark with a broadly
rounded snout; tall first dorsal fin with an almost straight front edge standing above the rear
tips of the long pectoral fins; a low ridge between the two dorsal fins; plain grey-brown back,
white belly, fin tips slightly dusky; cruising level.
Bottom-right — Tiger shark (Galeocerdo cuvier): heavy, very broad body; wide blunt square snout;
long upper tail lobe; blue-grey back with a row of dark vertical bars and spots along the flanks
that fade toward the tail; off-white belly; cruising with mouth closed.
```

**B3 — 大洋鲨与魟（3:2）** · ids: `hammerhead,thresher-shark,oceanic-manta,eagle-ray`
```
Top-left — Scalloped hammerhead (Sphyrna lewini): slim shark; head flattened into a wide hammer
with a notch at the centre of its front edge and two shallow scallops on each side, eyes at the
hammer tips; very tall curved first dorsal fin; bronze-grey back, off-white belly, dusky
pectoral tips; swimming level.
Top-right — Pelagic thresher shark (Alopias pelagicus): torpedo body with an upper tail lobe as
long as the whole body, sweeping up and back in one long thin curve; large round eye; short
snout, small mouth; metallic blue-grey back, white belly that stops before the pectoral fins;
long narrow pectorals.
Bottom-left — Oceanic manta ray (Mobula birostris), seen from directly above, head to the right:
heavy wide diamond with broad triangular wings; two head fins rolled into tubes; charcoal-black
back with two white shoulder patches forming a T across the top of the head; dark mouth and dark
head fins; a small knob at the tail base; wings fully spread.
Bottom-right — Spotted eagle ray (Aetobatus narinari), seen from directly above, head to the
right: flat diamond body with pointed wings; a rounded duck-bill snout projecting at the front;
deep navy-black back covered with evenly spaced white spots and rings; very long thin whip tail
trailing straight behind; wings level.
```

**B4 — 鲸豚（3:2）** · ids: `humpback-whale,sperm-whale,orca,dolphin`
```
Top-left — Humpback whale (Megaptera novaeangliae): large stocky whale; very long white-edged
pectoral fins about one third of the body length; knobbly head and lower jaw; throat grooves;
small dorsal fin on a hump; broad tail flukes with a serrated rear edge and white underside;
dark slate-grey body; arching slightly as if about to dive.
Top-right — Sperm whale (Physeter macrocephalus): huge squared-off block head about one third of
the body; narrow underslung lower jaw; wrinkled grey-brown skin behind the head; a low rounded
hump followed by small knuckles along the back; broad triangular flukes; swimming level.
Bottom-left — Orca (Orcinus orca), adult male: glossy black body with a crisp white oval eye
patch behind the eye, white chin and belly sweeping up into a lobe on the flank, a grey saddle
patch behind the dorsal fin; tall straight triangular dorsal fin; rounded paddle flippers;
swimming level.
Bottom-right — Spinner dolphin (Stenella longirostris): slender dolphin with a very long thin
beak; upright triangular dorsal fin; three-tone pattern of dark grey back cape, lighter grey band
along the side and pale off-white belly; dark line from eye to flipper; swimming level.
```

**B5 — 其他长条形（3:2）** · ids: `dugong,sea-lion,hawksbill,barracuda`
```
Top-left — Dugong (Dugong dugon): plump torpedo-shaped body; broad downturned bristly muzzle;
small eyes; short paddle-shaped front flippers; smooth finless back; whale-like fluked tail with
a central notch; grey with a paler belly; swimming slowly.
Top-right — Galápagos sea lion (Zalophus wollebaeki): sleek streamlined body; small pointed head
with a short dog-like muzzle, long pale whiskers and tiny external ear flaps; long tapered front
flippers swept back, hind flippers trailing; chocolate-brown back shading to tan belly; gently
curved underwater swimming pose.
Bottom-left — Hawksbill turtle (Eretmochelys imbricata): shell narrower than a green turtle's,
with scutes overlapping like roof tiles and a serrated rear edge; narrow head ending in a pointed
hooked beak; two claws on each front flipper; shell rich amber with dark brown tortoiseshell
streaks; swimming.
Bottom-right — Barracuda school (Sphyraena qenie, blackfin barracuda): a tight school of six,
swimming parallel and slightly staggered, all heading right; each a long silver spindle with a
pointed head, underslung jaw with visible teeth, about twenty dark chevron bars along the flank
and a dark black-edged tail.
```

**B6 — 高身礁鱼（1:1）** · ids: `bumphead-parrotfish,napoleon-wrasse,mandarinfish,sunfish`
```
Top-left — Bumphead parrotfish (Bolbometopon muricatum): large deep-bodied fish; steep vertical
forehead with a rounded bump; exposed pink beak-like tooth plates; olive-green body with a paler
face; broad fins; swimming level.
Top-right — Napoleon wrasse (Cheilinus undulatus): large deep-bodied fish with a high rounded
hump on the forehead; thick fleshy lips; teal-green body covered with fine wavy maze-like lines;
two dark diagonal lines behind the eye; rounded tail; swimming level.
Bottom-left — Mandarinfish (Synchiropus splendidus): small stout fish; broad rounded fins with
large fan-like pectorals; bulging eyes on a blunt head; body covered in swirling bands of orange
and electric blue with touches of green; hovering with fins spread.
Bottom-right — Ocean sunfish (Mola mola): very tall flattened disc-shaped body, taller than it is
long; a tall pointed dorsal fin on top and a matching anal fin below; the rear end is a short
rounded wavy rudder; small round mouth; large eye; silvery grey with a slightly darker back.
```

**B7 — 微距与鱼群（1:1；第 4 格留作补画）** · ids: `pygmy-seahorse,jack-school,sardine-run,<补画 id>`
```
Top-left — Pygmy seahorse (Hippocampus bargibanti): tiny seahorse with a short rounded snout;
body and tail covered in round knobbly tubercles; pale pink body with coral-red tubercles; tail
curled around a single branch of a matching pink sea fan; head to the right.
Top-right — Trevally school (Caranx sexfasciatus, bigeye trevally): a dense tornado-shaped
cluster of eight to ten fish, the cluster taller than wide; each fish deep-oval and silver with a
large eye, a small black spot at the top of the gill cover and a dusky forked tail; all heading
right.
Bottom-left — Sardine run (Sardinops sagax): one compact swirling bait ball of hundreds of small
sardines, drawn as a mass of short silver strokes with blue-grey backs and a row of tiny dark
spots; the ball reads as one rounded shape; the swirl flows to the right.
Bottom-right — <把前面哪一格没通过验收的描述贴在这里；都通过了就写 "empty cell, plain background">
```

#### 第二批物种（2026-10-21 数据第一波新增的 24 种；流程同上：STYLE-G + ANCHOR + LAYOUT + 四行）

**B8 — 礁鲨与大洋鲨（3:2）** · ids: `blacktip-reef-shark,caribbean-reef-shark,silky-shark,oceanic-whitetip`
```
Top-left — Blacktip reef shark (Carcharhinus melanopterus): small slender reef shark; short rounded
snout; tall first dorsal fin with a crisp black tip above a pale band; black tips on the pectorals and
the lower tail lobe; tan-grey back, white belly; cruising in shallow water.
Top-right — Caribbean reef shark (Carcharhinus perezi): stocky grey requiem shark; short, broadly
rounded snout; dusky undersides on the fins; a low ridge between the dorsal fins; grey-brown back,
white belly; cruising level.
Bottom-left — Silky shark (Carcharhinus falciformis): slim streamlined shark with a long rounded
snout; a small first dorsal fin set well behind the pectorals; very long sickle-shaped pectoral fins;
smooth bronze-grey back, white belly; mid-water swimming.
Bottom-right — Oceanic whitetip shark (Carcharhinus longimanus): robust shark with a short blunt
snout; a huge rounded paddle-like first dorsal fin and very long rounded pectorals, each tipped with
a mottled white patch; bronze-grey back, white belly; slow deliberate swimming.
```

**B9 — 大鲨与底栖鲨（3:2）** · ids: `great-white-shark,bull-shark,lemon-shark,nurse-shark`
```
Top-left — Great white shark (Carcharodon carcharias): heavy torpedo body; conical pointed snout;
large triangular first dorsal fin; crescent tail with lobes of nearly equal size; crisp two-tone
pattern, slate grey above and white below with a jagged dividing line; black eye; powerful cruising.
Top-right — Bull shark (Carcharhinus leucas): very stout thick body; short, blunt, broad snout; small
eyes; tall first dorsal fin; plain grey back, white belly; heavy cruising close to the bottom.
Bottom-left — Lemon shark (Negaprion brevirostris): stocky shark with a flat broad head and rounded
snout; two dorsal fins of nearly equal size; yellow-brown back shading to a pale cream belly; slowly
cruising over sand.
Bottom-right — Nurse shark (Ginglymostoma cirratum): broad flattened head with a small mouth and two
short barbels; tiny eyes; long tail with a small lower lobe; rounded dorsal fins set far back; plain
tan-brown body; resting flat on the sand.
```

**B10 — 石斑与躄鱼（1:1）** · ids: `giant-grouper,potato-cod,dusky-grouper,frogfish`
```
Top-left — Giant grouper (Epinephelus lanceolatus): enormous deep-bodied grouper; huge mouth with
thick lips; broad rounded fins; mottled olive-brown with faint pale blotches and small dark spots on
the fins; hanging still in the water.
Top-right — Potato cod (Epinephelus tukula): large grouper with a pale grey body covered in big dark
potato-shaped blotches; broad head with a wide mouth; rounded tail; calm, slightly turned toward the
viewer.
Bottom-left — Dusky grouper (Epinephelus marginatus): stout grouper with a big head and mouth; dark
brown body with irregular pale yellowish blotches; fins edged in a fine pale line; hovering by a rock.
Bottom-right — Frogfish (Antennarius commerson): round lumpy globe-shaped fish; wide upturned mouth;
hand-like pectoral fins used as feet; a tiny lure on a thin spine over the snout; warty skin in bright
orange; squatting on a rock.
```

**B11 — 魟与豹纹鲨（3:2）** · ids: `sicklefin-devil-ray,short-tail-stingray,southern-stingray,leopard-shark`
```
Top-left — Sicklefin devil ray (Mobula tarapacana), seen from directly above, head to the right: wide
diamond with swept sickle-curved wingtips; two small head fins; olive-brown back with a slightly paler
band behind the head; short tail; wings fully spread.
Top-right — Short-tail stingray (Bathytoshia brevicaudata), seen from directly above, head to the
right: a huge rounded disc nearly as wide as long; rounded snout; short thick tail with a small barb;
smooth grey-brown back with a paler disc edge; gliding.
Bottom-left — Southern stingray (Hypanus americanus), seen from directly above, head to the right:
diamond-shaped disc with slightly concave front edges and pointed corners; long whip tail; smooth dark
grey-brown back; gliding over sand.
Bottom-right — Leopard shark, also called zebra shark (Stegostoma tigrinum): long slender shark with
a very long upper tail lobe nearly as long as the body; low ridges along the back; small barbels at
the mouth; tan body covered in dark brown leopard spots; resting on sand.
```

**B12 — 鲸与冷水（3:2）** · ids: `brydes-whale,dwarf-minke-whale,seal,arctic-char`
```
Top-left — Bryde's whale (Balaenoptera edeni): slender streamlined baleen whale; three parallel
ridges running along the top of the head to the blowholes; a small sickle-shaped dorsal fin set far
back; dark grey back, pale belly; swimming level.
Top-right — Dwarf minke whale (Balaenoptera acutorostrata): small sleek whale with a sharply pointed
snout; tall curved dorsal fin; dark grey back with a pale shoulder blaze and a white band across each
pectoral fin; approaching with slight curiosity.
Bottom-left — Seal (Phoca vitulina, harbour seal): plump spindle-shaped body; rounded dog-like head
with large dark eyes, long whiskers and no visible ears; short front flippers, hind flippers trailing;
mottled grey coat; swimming with a gentle twist.
Bottom-right — Arctic char (Salvelinus alpinus): slender salmon-like fish; small head; forked tail;
olive-green back fading to an orange-red belly dotted with pale pink spots; white leading edges on the
lower fins; swimming level.
```

**B13 — 鳄鱼、沙虎鲨、珊瑚（3:2）** · ids: `american-crocodile,grey-nurse-shark,hard-coral,soft-coral`
```
Top-left — American crocodile (Crocodylus acutus): long low reptile swimming at the surface, side view;
narrow tapering snout with teeth showing along the jaw line; ridged armoured back; long muscular tail
trailing; olive-grey with a pale belly.
Top-right — Grey nurse shark, also called sand tiger (Carcharias taurus): bulky shark with a pointed
snout and a mouth full of long narrow protruding teeth; two large dorsal fins of similar size set well
back; brownish-grey back with faint rusty spots, pale belly; hovering almost motionless.
Bottom-left — Hard coral garden: a cluster of branching staghorn coral beside a dome of boulder coral;
pale sand, shell pink and seafoam tones; no fish.
Bottom-right — Soft coral (Dendronephthya): a bouquet-like tree of translucent branches tipped with
fluffy pink-and-orange polyps; gently swaying.
```

#### 第三批物种（2026-10-21 数据第二、三波新增 35 种 + 3 格重画）

流程同上：STYLE-G + ANCHOR + LAYOUT + 四行，成品在 `art/prompts/B14.txt`…`B23.txt`。批次按"作为潜点地图贴纸的次数"从高到低排（地图只画每个潜点 `species[0]` 的贴纸），同分再看引用总数，所以 B14 最值得先画：硬珊瑚一种就是 16 个潜点的地图贴纸。3 格重画（硬珊瑚、护士鲨、布氏鲸）用 B8–B13 验收时的改进描述，入库后覆盖旧贴纸。浅色部位（白肚、浅色枝条、半透明的玻璃鱼和海天使）一律写成"实色、明显比灰底深"，避免 rembg 抠成半透明；大锤头、扁鲨、蜘蛛蟹按俯视画（B3 的侧视锤头认不出，通过的是 B7 的俯视版）。

**B14 — 珊瑚、巨藻与海马（1:1；硬珊瑚为重画）** · ids: `hard-coral,giant-kelp,red-gorgonian,seahorse`
```
Top-left — Hard coral garden (Acropora): a compact cluster of a few thick branching staghorn coral
arms in solid lagoon teal beside a rounded dome of soft-sun-yellow boulder coral; a few small
shell-pink coral heads at the base; the branch tips the same solid teal as the branches; every part
in opaque flat colour clearly darker than the grey background; all growing from one small rounded
base of coral rock in the darker teal shade.
Top-right — Giant kelp forest (Macrocystis pyrifera): three tall slender kelp stalks rising side by
side from one small root-like holdfast, each lined along its whole length with long ribbed leaf
blades hanging from small round gas floats; stalks and blades golden amber (soft sun yellow with its
darker shade, deepening toward brown at the base), opaque and clearly darker than the background;
the stalks lean gently to the right as if in a light current.
Bottom-left — Red gorgonian (Paramuricea clavata): a large upright sea fan, wider than tall, of
thick candelabra-like branches that fork again and again in one flat plane; deep warm coral-red
branches with soft-sun-yellow tips on the outer twigs; a short stout trunk at the base; seen face-on
so the whole fan shows.
Bottom-right — Seahorse (Hippocampus spp.): upright S-shaped body with a long tube snout pointing
right; tail curled into a tight spiral below; bony ring segments across the belly and a small
crown-like knob on top of the head; a small fan-shaped fin on the back; soft sun yellow body with a
darker amber shade; floating upright and still.
```

**B15 — 护士鲨、玻璃鱼群、海蛇、巨石斑（3:2；护士鲨为重画）** · ids: `nurse-shark,glassfish,sea-snake,goliath-grouper`
```
Top-left — Nurse shark (Ginglymostoma cirratum): two rounded dorsal fins of similar size set far
back near the tail; broad flattened head with tiny eyes and two short barbels at the small mouth;
long tail with only a tiny lower lobe; broad rounded pectoral fins; plain tan-brown all over from
the pale sand swatch with its slightly darker shade; lying flat and still.
Top-right — Glassfish school (Parapriacanthus ransonneti, golden sweeper): one dense oval cloud of
about twenty small fish packed closely together, the cloud wider than tall and reading as one
rounded shape; each fish a short slim teardrop with a large eye and a forked tail, golden amber
(soft sun yellow with its darker shade) and fully opaque; all heading right.
Bottom-left — Sea snake (Laticauda colubrina, banded sea krait): long slim body ringed from head to
tail with evenly spaced deep navy bands alternating with soft lagoon-teal blue-grey bands, clearly
darker than the background; flattened paddle-shaped tail; small rounded head with a soft-sun-yellow
snout and upper lip; the body laid out in one long gentle horizontal S-curve, head at the right end.
Bottom-right — Goliath grouper (Epinephelus itajara): massive heavy body with a very broad flat head
and a wide mouth whose jaw reaches past the small eye; rounded tail, pectoral and soft dorsal fins;
yellowish olive-brown body (pale sand with its darker shade) with a few faint darker diagonal bands
and small dark spots on the head and fins; hovering still.
```

**B16 — 海龙与冷水微距（1:1）** · ids: `weedy-seadragon,red-coral,clione,leafy-seadragon`
```
Top-left — Weedy seadragon (Phyllopteryx taeniolatus): long slender seahorse-like body held almost
level with a long tube snout pointing right; a few small leaf-shaped flaps on the head, back and
tail; warm coral-red body dotted with small soft-sun-yellow spots, with thin deep navy bars across
the chest; thin tail curling gently downward; drifting calmly.
Top-right — Red coral (Corallium rubrum): a small bushy colony of short thick branches that fork
like a little tree; solid deep warm coral orange-red branches dotted with tiny warm off-white
eight-armed polyps; a short trunk on a small rounded rock base; compact and upright.
Bottom-left — Sea angel (Clione limacina): a small upright body with two wing-like fins spread wide
at the sides of the head, like angel wings; a bright coral orange-red core in the head and a smaller
one in the body; the body tapers to a pointed tail; solid opaque shell-pink body, clearly darker
than the background; swimming upright, head at the top.
Bottom-right — Leafy seadragon (Phycodurus eques): seahorse-like body covered in many large
branching leaf-shaped lobes on the head, back, belly and tail, so it looks like a drifting piece of
seaweed; long tube snout pointing right; golden-olive body and lobes (soft sun yellow with its
darker amber shade) with thin pale bands on the body and lagoon-teal green lobe tips, all opaque;
body held almost level, drifting calmly.
```

**B17 — 大锤头、蓝鲸、旗鱼、海牛（3:2；大锤头俯视）** · ids: `great-hammerhead,blue-whale,striped-marlin,manatee`
```
Top-left — Great hammerhead (Sphyrna mokarran), seen from directly above, head to the right: a very
wide hammer-shaped head with an almost straight front edge and a small notch at its centre, eyes at
the tips; a very tall curved sickle-shaped first dorsal fin; long sickle-shaped pectoral fins; plain
bronze-grey back; swimming level.
Top-right — Blue whale (Balaenoptera musculus): extremely long slender body with a broad flat
U-shaped head; a tiny stubby dorsal fin set far back near the tail; mottled blue-grey skin all over
with pale grey-blue speckles; belly a slightly paler blue-grey, still clearly darker than the
background; long slim flippers; broad flukes; gliding level.
Bottom-left — Striped marlin (Kajikia audax): long pointed spear-like bill; tall pointed first
dorsal fin, as tall as the body is deep at its front and sloping down toward the tail; deeply forked
crescent tail; long slim pectoral fins; deep navy back, silvery lagoon-blue flanks crossed by about
ten vertical pale lagoon-teal stripes; pale silver-blue belly; swimming level, dorsal fin raised.
Bottom-right — West Indian manatee (Trichechus manatus): a large round flat paddle-shaped tail,
turned slightly toward the viewer so its round outline shows; plump wrinkled body with a broad blunt
bristly snout and small eyes; short front flippers with tiny nails; smooth rounded back; plain warm
grey-brown with a darker shade; swimming slowly, body level, flippers hanging down.
```

**B18 — 姥鲨、红海龟、七鳃鲨、扁鲨（3:2；扁鲨俯视）** · ids: `basking-shark,loggerhead-turtle,broadnose-sevengill-shark,angel-shark`
```
Top-left — Basking shark (Cetorhinus maximus): huge mouth held wide open in a round gape for filter
feeding, dark navy inside, under a conical pointed snout; five very long gill slits that almost
encircle the head; large triangular first dorsal fin; crescent tail; plain grey-brown body with a
slightly paler belly, all clearly darker than the background; cruising slowly and calmly.
Top-right — Loggerhead turtle (Caretta caretta): very large broad head with a heavy blunt beak;
heart-shaped reddish-brown shell (warm coral orange-red deepened toward brown) with large plain
scutes lying edge to edge; head and flippers yellow-tan (pale sand) with darker scale plates; pale
sand underside; front flippers in mid-stroke; swimming.
Bottom-left — Broadnose sevengill shark (Notorynchus cepedianus): a single small dorsal fin set far
back near the tail; seven gill slits on each side of the head; broad, short, rounded snout with
small eyes; long upper tail lobe; silvery grey-brown back and sides covered in small black spots and
a few pale spots; pale sand belly; cruising level.
Bottom-right — Angelshark (Squatina squatina), seen from directly above, head to the right: flat,
wide ray-like body with broad rounded wing-like pectoral fins and smaller pelvic fins behind them; a
broad flat rounded head with the eyes on top; a thick shark-like tail with two small dorsal fins and
a small tail fin; sandy brown (the darker pale sand shade) with scattered small pale and dark spots;
lying flat, fins spread.
```

**B19 — 巨型乌贼、海象、蜘蛛蟹、黑珊瑚（1:1；蜘蛛蟹俯视）** · ids: `giant-cuttlefish,walrus,giant-spider-crab,black-coral`
```
Top-left — Giant Australian cuttlefish (Sepia apama): broad oval body edged along its whole length
by a thin wavy fin; a short cone of thick arms held together at the front, pointing right, with a
large eye and W-shaped pupil just behind them; a few small skin flaps above the eye; mottled shell
pink and pale sand with darker sand patches; hovering level.
Top-right — Walrus (Odobenus rosmarus): two long ivory tusks hanging straight down from the upper
jaw; a broad square muzzle with a thick bristly moustache; massive wrinkled body resting on its
belly, the front propped up on its front flippers, head raised; small eyes; hind flippers trailing;
warm pinkish-brown skin (shell pink deepened with the darker pale sand shade); tusks pale sand
ivory, clearly darker than the background.
Bottom-left — Giant spider crab (Leptomithrax gaimardii), seen from directly above, front to the
right: a pear-shaped knobbly carapace covered in short blunt spines, narrow end toward the right;
two slim arms with small claws reaching forward; four pairs of very long slender jointed legs spread
wide and evenly; warm coral orange-red with shell-pink knobs; standing as if walking.
Bottom-right — Black coral (Antipathella fiordensis): an upright bushy colony shaped like a small
fir tree with dense feathery side branches; a short deep navy trunk and a few navy main stems where
the black skeleton shows; the feathery branches covered in living polyps in solid pale sand with a
darker sand shade, clearly darker and warmer than the background; growing from a small rounded rock
base.
```

**B20 — 加州豹纹鲨、黄金河虎、鳕鱼、肩章鲨（3:2）** · ids: `california-leopard-shark,dourado,atlantic-cod,walking-shark`
```
Top-left — California leopard shark (Triakis semifasciata): bold dark saddle-shaped bars across the
back and large dark oval spots along the flanks; slim houndshark body with a short rounded snout;
two dorsal fins, the first larger; silvery bronze-grey body with deep navy saddles and spots; pale
sand belly; cruising level.
Top-right — Golden dorado (Salminus brasiliensis): heavy salmon-like river fish glowing golden
orange all over; a big head with a large mouth and strong jaw; rows of fine dark dots running along
the scale rows as thin stripes; a dark navy band across the middle of the forked tail; soft sun
yellow body deepening to coral orange on the back; fins warm coral orange-red; swimming level.
Bottom-left — Atlantic cod (Gadus morhua): three rounded dorsal fins in a row and a single barbel on
the chin; a heavy head with the upper jaw slightly overhanging the lower; a thin pale curved line
along the flank; olive-sand back densely covered in small darker spots, fading to a pale sand belly;
square-cut tail; swimming level.
Bottom-right — Walking shark (Hemiscyllium freycineti): a large dark eyespot just behind each
pectoral fin; broad paddle-like pectoral and pelvic fins planted down as if walking; slender body
and a long thick tail making up more than half its length; two small dorsal fins set far back; tan
body (pale sand with its darker shade) covered in small dark brown spots and a few pale spots;
mid-stride, body gently curved.
```

**B21 — 宝石海葵、小丑鱼、章鱼、企鹅（1:1）** · ids: `jewel-anemone,clownfish,giant-pacific-octopus,penguin`
```
Top-left — Jewel anemone (Corynactis australis): a tight cluster of about seven tiny anemones packed
side by side, each a short column topped by a ring of tentacles that each end in a round knob; mixed
shell pink, warm coral orange-red and soft sun yellow, the knobs a paler tone of each colour;
growing from one small rounded rock base.
Top-right — Clownfish (Amphiprion clarkii, Clark's anemonefish): three bold warm off-white vertical
bands, behind the eye, mid-body and at the tail base, each edged by a thin navy line; small oval
body with rounded fins; deep navy-black body with a soft-sun-yellow snout, belly, fins and tail;
hovering level.
Bottom-left — Giant Pacific octopus (Enteroctopus dofleini): a large rounded wrinkled mantle swept
up and back behind the head, with the eye facing right; eight long thick arms spreading outward
below in loose curls, a few curled tips showing rows of shell-pink suckers; skin warm coral
orange-red with a darker red-brown shade and small raised bumps; hovering.
Bottom-right — Gentoo penguin (Pygoscelis papua): bright coral orange-red bill and orange feet; a
warm off-white bonnet stripe over the top of the head from eye to eye; standing upright, turned
three-quarters toward the viewer with the bill pointing right; deep navy-black head, back and
flippers; solid warm off-white chest and belly with a faint cream tint; flippers held slightly away
from the body; short stiff tail.
```

**B22 — 巨型黑鲈、布氏鲸、南露脊鲸、星空河豚（3:2；布氏鲸为重画）** · ids: `giant-sea-bass,brydes-whale,southern-right-whale,white-spotted-pufferfish`
```
Top-left — Giant sea bass (Stereolepis gigas): massive deep body with a large mouth; a spiny front
dorsal fin that drops into a taller soft rear dorsal fin; broad rounded pectoral fins and a nearly
straight-edged tail; dark bronze-grey body scattered with large irregular darker spots; hovering
still.
Top-right — Bryde's whale (Balaenoptera edeni): three parallel ridges running along the top of the
head to the blowholes; a small sickle-shaped dorsal fin set far back; slender streamlined baleen
whale; dark slate-grey back and flanks; belly and throat one solid flat pale-sand tone, clearly
darker and warmer than the background, with a few thin darker sand throat-groove lines; swimming
level.
Bottom-left — Southern right whale (Eubalaena australis): rough pale knobbly patches on the top of
the head, the chin and above the eye; a strongly arched narrow upper jaw with a long curved mouth
line; huge rotund body with a smooth broad finless back; broad paddle-shaped flippers; wide smooth
flukes; deep navy-black body with the head patches in pale sand; swimming level.
Bottom-right — White-spotted pufferfish (Torquigener albomaculosus): small rounded pufferfish body
tapering to a slim tail; back densely covered in tiny round warm off-white dots; large eye and a
small beak-like mouth; pale sand-brown back (the darker pale sand shade) fading to a pale sand
belly; small fan-shaped fins; hovering level.
```

**B23 — 狼鳗、狼鱼（3:2；只有上排两格，下排留空）** · ids: `wolf-eel,wolffish,-,-`
下排两格留空：LAYOUT 段末尾多一句 `In this image only the top two cells have subjects; the bottom-left and bottom-right cells stay as plain empty background.`。
```
Top-left — Wolf eel (Anarrhichthys ocellatus): very long eel-like body tapering to a fine point at
the rear; a large blunt head with heavy jowls, thick lips and a lumpy forehead; a single long low
fin running the whole length of the back; grey-brown body covered in dark round spots, each ringed
with a paler tone; pale sand face; the body laid out in a long gentle horizontal S-curve, head at
the right end.
Top-right — Atlantic wolffish (Anarhichas lupus): big rounded blunt head with strong dog-like fangs
showing at the front of the mouth; elongated body with one long dorsal fin running from head to tail
and a small rounded tail fin; blue-grey body with about ten dark vertical bars along the front two
thirds; pale sand face; resting level with the head slightly raised.
Bottom-left — empty cell: plain background only.
Bottom-right — empty cell: plain background only.
```

**D1 — 装饰（1:1；LAYOUT 里的 70% 改成 60%）** · ids: `deco-compass,deco-boat,deco-seafan,deco-lighthouse`
```
Top-left — Compass rose: an eight-point star rose, four long points in deep navy alternating with
four short points in pale sand, a small off-white circle at the centre; pure geometry, nothing
written on it.
Top-right — Liveaboard dive boat: a small white two-deck boat in side profile, bow pointing right,
a lagoon-teal stripe along the hull, an open upper sun deck with a railing and a short mast; no
people, no flags, nothing written on it.
Bottom-left — Sea fan: a lacy fan-shaped shell-pink gorgonian on a short base, fan opening upward.
Bottom-right — Lighthouse islet: a short white tower with two coral bands and a navy lantern top,
standing on a rounded sand-coloured rock.
```
罗盘上的 N/E/S/W **不画进图里**：中文界面要显示 北/东/南/西，字母由代码按 i18n 渲染（`compass.n/e/s/w`）。

**D2 — 天空元素（1:1）** · ids: `deco-sun,deco-cloud-a,deco-cloud-b,deco-cloud-c`
```
Top-left — Sun: a plain soft-yellow disc with a single slightly darker lower-right crescent.
Top-right — Cloud A: one soft rounded off-white cloud, wider than tall.
Bottom-left — Cloud B: one smaller soft rounded off-white cloud, three lobes.
Bottom-right — Cloud C: one long low off-white cloud.
```

**先不画**：潜水浮标、沉船、冰山（当前没有潜点引用；巨藻和珊瑚花园已在 B14），海面波纹纹理（代码里用 SVG `<pattern>` 画正弦线，0 KB、可换主题）。

**进度**：B1–B7（27 种）与 B8–B13（24 种）已于 2026-10-21 全部出图并入库（51 个贴纸），B1 原图是后续所有批次的 ANCHOR。B8–B13 验收后有 3 格要重画（布氏鲸白肚子和硬珊瑚浅色枝条被抠成半透明、硬珊瑚底下多了沙地、护士鲨颜色和背鳍位置不对），出图对话已删，改为并入第三批整张新画。接下来按 B14–B23 画数据第二、三波新增的 35 种 + 这 3 格（38 格，B23 只有两格）。没有贴纸的物种在地图上显示为圆点（目前 317 个潜点里 35 个），不阻塞上线。

### 3.4 中文名规则（2026-10-20 已定）

原则：**潜水员看得懂的叫法优先于学名**，`sci` 只记录贴纸画的是哪一种，界面不显示。

- 潜点用通行译名，俚语放括号：`马拉帕斯夸（妈妈岛）`，不用"妈妈拍丝瓜"。
- 现象类保留"风暴"：梭鱼风暴 / 杰克鱼风暴 / 沙丁鱼风暴，因为用户看的是"这个潜点有什么"。
- 泛称：海豚、海狮；不写飞旋海豚 / 加岛海狮。
- 隆头鹦哥鱼保留；雪花鸭嘴燕魟改为 **鹰鳐**；虎鲨按口语保留。
- 旧版表里的 布氏鲃 是错的：Sphyraena qenie = 暗鳍金梭鱼（鲃是淡水鱼），描述里已改。

---

## 4. 尺寸与导出规格

| 用途 | 生成 | 切出的格 | 导出 | 显示 | 体积预算 |
|---|---|---|---|---|---|
| 物种宫格（长条形批次） | 3:2 横版，≥ 1536×1024 | ≥ 768×512 | — | — | — |
| 物种宫格（高/圆形批次） | 1:1，≥ 1024×1024 | ≥ 512×512 | — | — | — |
| 地图贴纸 | 从格切出 | — | `<id>-192.webp` | 64–96 px（@2x） | ≤ 15 KB |
| 卡片主图 | 从格切出 | — | `<id>-512.webp` | 240 px | ≤ 40 KB |
| 装饰元素 | 1:1 宫格 | — | `deco-<name>-192/512.webp` | 按需 | ≤ 20 KB |

主体填格 70% → 3:2 的格里长条形主体约 540 px 长边，卡片 512 px 不用放大；1:1 的格里约 360 px，高身鱼在卡片上略有放大，可接受。如果比例选择器给到更高分辨率（2K），直接用。

地图上的显示尺寸由 `species.json` 的 `lengthM`（典型成体体长，米）按对数缩放：2 cm → 22 px、1 m → 45 px、10 m → 58 px、25 m → 64 px（CSS px，@2x 即 44–128 px）。鱼群类按"看到的群体"估尺寸。没有 `lengthM` 时退回 `sizeClass`：`xl` 48 · `l` 40 · `m` 32 · `s` 24 px。

---

## 5. 透明背景：模型事实与路线（2026-10-20 核实）

- ChatGPT 里的出图模型是 **ChatGPT Images 2.5**（2026-09-08 起，所有档位含 Plus），对应 API 的 `gpt-image-2.5-flare` / `-sunburst`。
- **API** 两个 2.5 模型都支持 `background: "transparent"` + PNG/WebP 输出，支持任意比例（边长 16 的倍数、≤ 3840 px）。
- **ChatGPT App** 官方说"可以按要求把背景做成透明"，但社区大量反馈不稳定：同一 prompt 有时给真 alpha，有时给画上去的棋盘格或纯白底。所以：

| 路线 | 做法 | 用法 |
|---|---|---|
| **默认：STYLE-G + rembg** | 灰底出图 → 脚本抠图 | 每批都这样做，结果可控 |
| 顺手：STYLE-T | 每批最多试 1 次；下载后验证真透明才用 `--no-rembg` | 验证命令见下 |
| 备用：API | `gpt-image-2.5-sunburst`, `size 1536x1024`, `quality high`, `background transparent`, `output_format png` | 只有 App 路线走不通时再考虑（按张计费） |

验证一张下载图是不是真透明：
```bash
uv run --python 3.13 --with pillow python -I -c "from PIL import Image;import sys;im=Image.open(sys.argv[1]);a=im.getchannel('A') if im.mode=='RGBA' else None;print(im.mode,im.size,'corner alpha',a.getpixel((2,2)) if a else 'none')" grid.png
```
只有打印 `RGBA … corner alpha 0` 才是真透明；`RGB` 或 `corner alpha 255` 就按 STYLE-G 重生成，不要反复试。

灰底注意：#E6E6E6 和白肚皮（off-white）只差约 20 个灰阶，所以抠图必须用 rembg（语义分割），不能用颜色键控。白肚物种（鲨鱼、虎鲸、海豚、儒艮）处理后要检查肚子有没有被吃掉；`--alpha-erode 1` 只用于去白边，不用于补肚子。

---

## 6. 处理流水线

本机 `python3` 是 3.14 且 `pyexpat` 损坏，**统一用 uv 指定 3.13 运行**（首次会下载 179 MB 的 isnet 模型到 `~/.rembg/`，之后秒级）：

```bash
# 一张 2x2 宫格（id 顺序 = 同目录 ids.txt，左上、右上、左下、右下）。--outline 2.5 是定稿标准，每批都加
uv run --python 3.13 --with 'rembg[cpu]' --with pillow \
  python scripts/process-sprites.py art/raw/batch-01/grid.png --grid 2x2 \
  --ids-file art/raw/batch-01/ids.txt --outline 2.5

# 真透明的图跳过抠图
uv run --python 3.13 --with pillow python scripts/process-sprites.py art/raw/batch-01/grid.png --grid 2x2 --ids-file ... --outline 2.5 --no-rembg
```
（`npm run sprites -- …` 等价于直接调脚本，但它用的是系统 `python3`，在这台机器上不可用。）

```
art/raw/<batch>/grid.png + ids.txt   ← ChatGPT 下载的原图（PNG）+ 四个 id（阅读顺序，"-" 表示该格作废）
        │  scripts/process-sprites.py
        ▼
1. 整张图先 rembg 去底（isnet-general-use，alpha matting）或 --no-rembg
2. 按连通域切分，每个连通域按质心归到所在格：越过中线的尾巴 / 翼尖跟着自己的动物走，
   邻格伸过来的鳍不会被带进来；碎屑（< 最大块 0.4%）丢弃；抠图留下的封闭空洞（灰底上的白肚皮）用原图像素补回
3. 裁掉透明边（留 4% 安全边）
4. 等比缩放到 192 / 512 长边；--outline 2.5 烘入米白刀模边；导出 WebP（quality 82，method 6）；超预算会打印 "← over budget"
5. 写入 public/sprites/manifest.json
```

`--outline 2.5`（**2026-10-21 定稿，所有贴纸统一加**）：一圈 2.5 px（按 192 尺寸计，512 尺寸按比例放大）的米白"刀模边"，解决深色物种（鲸鲨、蝠鲼）在夜间深蓝海面上看不见的问题；边是在导出时烘进 WebP 的，运行时零开销，体积反而略小。

检查项：
- `public/sprites/*-192.webp` 全部 ≤ 15 KB、`*-512.webp` ≤ 40 KB；密集鱼群（杰克鱼风暴、沙丁鱼风暴）压缩差，单独用 `"--ids=-,jack-school,sardine-run,-" --quality 60` 重导出即可达标。
- 在日 / 夜两种背景各预览一次，看是否有残留白边；有则 `--alpha-erode 1`。
- 两个动物贴在一起（连通域连成一块）时会被归到同一格：那是 prompt 问题，用局部编辑重画那一格。§7 验收第 3 条（压线）因此只需防"互相接触"，轻微越线已由脚本处理。

---

### 6.1 特例配方（2026-10-22，B14–B23 实测）

- 洞填充现在只回填"原像素不是底灰"的孔：白肚子照旧补上，巨藻叶间、柳珊瑚枝间的真空隙保持透明。
- `--key`（可选）：不用 rembg，按每个像素与平灰底的色距抠图，适合被 rembg 当成背景的浅色 / 细碎主体。只对单格用，其余格照常。
- 已用的特例命令（都带 `--outline 2.5`，重跑普通命令会把这些格切坏或超预算）：
  - B14 `--ids=-,giant-kelp,red-gorgonian,- --quality 60`
  - B15 `--ids=-,glassfish,-,- --key`
  - B19 `--ids=-,-,giant-spider-crab,- --key`；`--ids=-,-,-,black-coral --key --quality 60`
  - B22 `--ids=-,-,-,white-spotted-pufferfish --key`
- 超预算先试 `--quality 60`（沙丁鱼、巨藻、柳珊瑚、蜘蛛蟹、黑珊瑚都是这样过的），没有 384 px 的备用路线。

## 7. 每张图的验收清单（存进 `art/raw/` 之前）

1. **文件**：PNG；像素 ≥ 1536×1024（3:2）或 ≥ 1024×1024（1:1）。`sips -g pixelWidth -g pixelHeight -g hasAlpha grid.png`。小了或是 JPEG → 重生成。
2. **背景**：STYLE-G 四角和中线两点同一平灰（吸管 ±3）；STYLE-T 见 §5 验证命令。
3. **越线**：缩到 25% 看中线十字，任何主体像素压线 → 只重画那一格。
4. **文字**：放大四角和主体下方，零字母 / 数字 / 签名 / 水印。
5. **解剖**：每格描述的前两个特征都在（如锤头缺口 + 高背鳍；T 形白斑 + 黑嘴）；头朝右；魟是俯视。
6. **一致性**：没有哪一格更立体 / 更有纹理 / 更卡通 / 有描边；颜色都在色板内；阴影都在右下。
7. **缩小测试**：`sips -Z 96 grid.png --out /tmp/s.png`，四格仍能认出物种。不行 → 简化那格描述（更少、更大的形状）只重画那格。
8. **杂物**：形状内没有投影、地面、水、气泡、颗粒、纸纹。
9. **保存**：`art/raw/batch-NN/grid.png` + `ids.txt`（四个 id，阅读顺序）；跑脚本，确认每个 `*-192.webp` ≤ 15,000 B、`*-512.webp` ≤ 40,000 B。

**第一批通过全部 9 项后冻结为 ANCHOR 参考图，以后不再重生成。**

---

## 8. 常见问题

- **模型总是加文字 / 标签**：描述里别出现 "label" "icon" "map"；STYLE 末尾那串 "no text, no letters…" 保留。
- **四格风格不一**：用局部编辑只重画离群的那一格；或把最满意的一格裁出来当输入 2 重画其余三格。
- **物种不像**：把最关键的特征放到描述第一句，减少形容词，保留拉丁名。
- **太卡通**：加 `calm, elegant, museum-quality natural history illustration`；去掉任何 "cute"。
- **透明图有棋盘格**：那是画上去的，不是透明；回到 STYLE-G。
- **白肚子被抠掉**：换一张（灰底颜色正常的情况下 rembg 很少出错），不要靠 erode 修。
