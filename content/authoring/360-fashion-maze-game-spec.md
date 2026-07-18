# 360 FASHION MAZE GAME
## World & Prompt Spec for LingBot World 2 (reactor.inc)

---

## 1. THE STORY

You are a **fashion blogger**. A fashion PR hands you an envelope: an invitation to the season's grand finale fashion show. The address leads not to a venue but to a **fashion maze** — inspired by Chanel's Shanghai hedge-maze show. You arrive late. A timer starts: **10 minutes** to reach the finale before the gate closes. Each level, the timer shrinks.

Inside, the maze shifts identity section by section. Every zone is a living fashion installation — diverse models of every ethnicity and body shape, in sculptural couture, posing, shifting, circling. You photograph everything (you're a blogger), collect coins, dodge dead ends, and race the clock. Make it through the closing gate and you earn a front-row seat at a water-runway spectacle with fireworks. Run out of time, and the gate seals. You lose.

---

## 2. ARCHITECTURE: WHAT LINGBOT RENDERS vs WHAT REACT OWNS

LingBot World 2 renders **one world per session** from a seed image + composed prompt + live input. The maze game is therefore a **React harness orchestrating multiple zone-worlds**, not one giant prompt.

| System | Owner | How |
|---|---|---|
| Zone visuals, models posing, atmosphere | **LingBot** | One layered prompt set + seed image per zone |
| Zone transitions (junctions, doors, dead ends) | **React** | Maze graph in app state; reaching an exit trigger swaps the base layer (portal-world pattern) or starts a fresh session seeded with the next zone's image |
| Countdown timer | **React** | HUD overlay; per-level duration config (L1: 10:00, L2: 8:00, L3: 6:00…) |
| Coins | **React** | HUD-composited sprites at fixed screen/zone positions with pickup radius + sound. **Do not prompt coins into the world** — the model will drift, multiply, or melt them. Overlay keeps them crisp and collection deterministic |
| Photo capture | **React** | Hold-key `P`: capture the current video frame from the canvas (`canvas.toBlob`), flash overlay + shutter sound, save to the blogger's in-game camera roll. Bonus points if captured while a "group pose" event is held |
| Score | **React** | Coins + photos (rarity bonus per zone) + time remaining |
| Dead ends | **Maze graph** + a dead-end variant prompt (see §5.11) |
| Gate closing / win-lose | **React** state driving the finale-approach event (§6) |

**Player POV recommendation: first-person.** Your reference images show the installations, not the blogger — and the seed image always wins over text. First-person means your uploaded photos work **directly as seed frames** (they're already 16:9, matching the model's 1664×960), and it makes the photography mechanic literal: the screen *is* her camera. All prompts below are written first-person, anchored on each installation per the skill's first-person adaptation.

---

## 3. SHARED PROMPT TEMPLATES (reused verbatim across all zones)

Per the skill: find the form that works and reuse it exactly. Substitute only the bracketed anchor.

**camera.static**
> First-person view, the [installation] holding steady at the centre of the frame at constant size and distance. Neither the [installation] nor the camera moves on its own; arrow-key look-input is the only source of camera motion, panning the view across the stationary, centred [installation] only while held.

**camera.dynamic**
> Strict first-person view, the [installation] holding steady at the centre of the frame as the viewpoint advances through the maze corridor toward it; look-input becomes the heading changing.

**movement.dynamic**
> The viewpoint glides forward along the maze floor at a steady walking pace, the corridor walls sliding past on both sides, floor pattern scrolling smoothly underfoot, the installation ahead growing gradually nearer.

**vertical.jump**
> The viewpoint springs upward in a quick smooth arc, rising above the corridor before dropping back down and settling level at walking height.

**vertical.crouch / stand** — use the stock production strings unchanged.

`movement.static` is per-zone (it's the idle where the models live — see each zone).

---

## 4. THE MAZE MAP — 10 ZONES

```
                    ENTRANCE (envelope / gate opens)
                         |
                 [1] NEON MIRROR ATRIUM
                    /            \
     [2] GOLDEN CIRCUIT      [4] OP-ART PALACE
         STAIRWAY                CORRIDOR
            |                    /        \
     [3] AFRO-PSYCHEDELIC   [5] PINK     [X] DEAD END A
         ROTUNDA             SEQUIN          (op-art cul-de-sac)
            \                LEGION
             \                 |
              [9] CLASSIC   [7] TWISTED VINE
                  HEDGE         TUNNEL
                  GARDEN       /       \
                    \    [8] OVERGROWN  [X] DEAD END B
                     \       STONE        (vine wall)
                      \      GARDEN
                       \      /
                  [10] GATE APPROACH
                   (gate closing on timer)
                         |
                  GRAND FINALE SHOW
```

Zones 2/3 and 4→5→7/8 are alternate routes; dead ends cost time. React's maze graph decides which zone-world loads at each junction.

---

## 5. ZONE PROMPT SETS

Each zone: **base** (≤600 chars), **movement.static** (the idle — models alive but settled), and **events** on hold-keys. Camera/movement/vertical come from §3 with the zone's anchor substituted. Every zone shares three signature blogger events:

- **Key 1 — POSE SHIFT**: models transition to a new held pose
- **Key 2 — RUNWAY CIRCLE**: models walk a small circle one by one, presenting each look
- **Key 3 — GROUP POSE**: models assemble into a tight formation and hold — the photo moment (React grants bonus points if `P` fires during this hold)

---

### 5.1 ZONE 1 — NEON MIRROR ATRIUM *(seed: image 1 — cyberpunk group, purple neon halo hall)*
**Anchor:** "the five models"

**base**
> Five fashion models of diverse Black and brown ethnicities in sculptural metallic couture — a central model with locs in a ribbed silver-blue jacket, flanked by hooded figures in iridescent navy coats and a silver gown — inside a vast mirrored cyberpunk atrium. The world contains EXACTLY ONE ring of glowing yellow neon halos suspended overhead at a fixed position AND EXACTLY TWO mirrored corridor walls receding left and right at fixed positions. Violet and magenta neon columns, reflective patterned floor. Cinematic cyberpunk editorial, high gloss.

**movement.static**
> The five models hold their formation on the reflective floor, fabric shimmering faintly under the neon, the central model's chest rising with slow breaths, the hooded figures' coats settling in the still air.

**Events**
- **Pose shift:** The five models flow into a new editorial stance — hips angled, chins lifted, one hand raised — their metallic fabrics catching violet light as they settle and hold.
- **Runway circle:** One by one the models step out and trace a small slow circle on the reflective floor, each garment turning through the neon glow, before rejoining the line and settling still.
- **Group pose:** The five models draw together into a tight triangular formation, the central model front and centre, all faces toward the viewer, holding perfectly poised under the yellow halos.

---

### 5.2 ZONE 2 — GOLDEN CIRCUIT STAIRWAY *(seed: image 2 — plus-size model, golden neon stairs)*
**Anchor:** "the model"

**base**
> A regal plus-size Black fashion model in a flowing circuit-board-print kaftan gown with a beaded silver collar, blonde-tipped braids, and a geometric headdress, standing at the base of a monumental golden staircase. The world contains EXACTLY ONE wide staircase of glowing amber-lit steps rising straight ahead at a fixed position, flanked by EXACTLY TWO towering walls of pink and teal circuit-pattern panels at fixed positions. Warm gold light, polished reflective floor. Afrofuturist couture editorial, radiant and majestic.

**movement.static**
> The model stands sovereign at the foot of the stairs, her kaftan drifting gently at the hem, beaded collar glinting, her gaze steady on the viewer as the amber steps glow behind her.

**Events**
- **Pose shift:** The model raises both arms slowly outward so the kaftan spreads like wings, the circuit print catching the golden stair-light, then holds the open pose.
- **Runway circle:** The model walks a slow deliberate circle on the reflective floor, the gown's full silhouette turning through the amber glow, and settles back facing the viewer.
- **Group pose:** The model ascends three glowing steps, turns, and holds a crowned, symmetrical pose at the staircase's centre line, the circuit walls blazing on either side.

---

### 5.3 ZONE 3 — AFRO-PSYCHEDELIC ROTUNDA *(seed: image 3 — plus-size women, orange geometric rotunda)*
**Anchor:** "the four models"

**base**
> Four powerful plus-size Black fashion models in bold orange, red, and green Afro-psychedelic print robes and hooded wraps, with sculpted braids in amber, black, and red, dramatic magenta eye makeup, gathered inside a glowing orange rotunda. The world contains EXACTLY ONE huge circular ribbed dome wall of radiant orange geometric panels behind them at a fixed position. Saturated tangerine light, kaleidoscopic patterned surfaces. Afrofuturist psychedelic editorial, fierce and warm.

**movement.static**
> The four models stand shoulder to shoulder in the orange glow, robes hanging heavy and still, long braids swaying almost imperceptibly, their expressions fierce and fixed on the viewer.

**Events**
- **Pose shift:** The four models tilt into a staggered diagonal of attitudes — arms crossed, hand on hip, chin raised — patterned robes overlapping into one kaleidoscope, then hold.
- **Runway circle:** One by one each model steps forward and turns a slow full circle in the rotunda's centre, her printed robe flaring softly, before stepping back into the line.
- **Group pose:** The four models close ranks around the central figure, faces stacked in a tight pyramid toward the viewer, braids draped forward, holding regally still against the glowing dome.

---

### 5.4 ZONE 4 — OP-ART PALACE CORRIDOR *(seed: image 4 — B&W geometric gowns, ornate hall)*
**Anchor:** "the six models"

**base**
> Six Middle Eastern fashion models, women and men, in floor-length black-and-white op-art gowns — chevrons, spirals, and meander stripes — with matching patterned headbands, arranged down an opulent palace corridor. The world contains EXACTLY ONE arched doorway of nested black-and-white rings straight ahead at a fixed position AND EXACTLY TWO walls of framed baroque paintings and geometric tilework at fixed positions left and right. Black-and-white hexagonal marble floor. Surreal op-art couture editorial, hypnotic and stately.

**movement.static**
> The six models stand spaced along the marble corridor, gowns falling in crisp graphic folds, dark hair stirring faintly, the nested arches framing them in receding rings.

**Events**
- **Pose shift:** The six models pivot in unison to profile, patterned gowns aligning into one continuous optical stripe down the corridor, then hold the illusion motionless.
- **Runway circle:** The two nearest models glide forward and circle each other slowly on the hexagonal floor, their spiral and chevron prints interweaving, then return to their marks.
- **Group pose:** The six models converge beneath the nested arch into a symmetrical V-formation, headbands aligned, gowns pooling on the marble, holding statue-still for the frame.

---

### 5.5 ZONE 5 — PINK SEQUIN LEGION *(seed: image 5 — hooded pink sequin suits)*
**Anchor:** "the legion of models"

**base**
> A legion of Middle Eastern male fashion models in glittering pink, magenta, and coral sequined suits with structured shoulders, gold belt buckles, and beaded hooded caps with violet visors, massed in ranks that recede into soft focus. The world contains EXACTLY ONE central model in a rose chainmail-sequin coat standing nearest at a fixed position. Blue-violet studio backdrop, saturated pink light. High-fashion runway editorial, dazzling and uniform.

**movement.static**
> The legion of models stands in silent ranks, sequins shimmering with each slow breath, the central model's visor catching a line of violet light, hoods utterly still.

**Events**
- **Pose shift:** The central model plants one hand on his gold belt and squares his shoulders as the ranks behind mirror him a beat later, a wave of pink sequins settling into the pose.
- **Runway circle:** The central model strides a tight circle at the front of the formation, his chainmail coat flashing through pink and silver, then resumes his mark facing the viewer.
- **Group pose:** The front three ranks compress into a dense triangular phalanx behind the central model, every visored face level and forward, sequins blazing, holding motionless.

---

### 5.6 ZONE 7 — TWISTED VINE TUNNEL *(seed: image 7 — dark brocade, coiled vines)*
**Anchor:** "the two models"

**base**
> Two Chinese male fashion models in gold-and-black baroque brocade suit jackets over black shirts — one with a swept blond-streaked undercut, one with a long dark side-fringe — standing in a dark tunnel of enormous coiled copper vines. The world contains EXACTLY ONE arched vine-woven ceiling glowing faintly gold overhead at a fixed position AND EXACTLY ONE dark stone doorway straight ahead at a fixed position. Shadowed ferns, deep bronze and green gloom. Dark-fantasy couture editorial, moody and cinematic.

**movement.static**
> The two models stand close in the bronze gloom, brocade glinting where thin light finds it, their breathing slow, a fern frond trembling faintly at the tunnel's edge.

**Events**
- **Pose shift:** The two models turn back-to-back, jaws set, brocade shoulders aligned, the gold thread tracing one continuous pattern across both jackets as they hold.
- **Runway circle:** Each model in turn walks a slow half-circle through the vine shadows, his jacket catching and losing the golden ceiling light, then returns beside the other.
- **Group pose:** The two models step shoulder to shoulder before the dark doorway, faces forward and lit from above, holding a stern symmetrical stance for the frame.

---

### 5.7 ZONE 8 — OVERGROWN STONE GARDEN *(seed: image 8 — mossy maze, geometric coats)*
**Anchor:** "the two models"

**base**
> Two young Asian male fashion models in geometric couture — one in a silver-grey meander-pattern long vest over black, one in a copper-and-black angular coat — standing on a brick path inside an ancient overgrown stone maze. The world contains EXACTLY TWO rows of carved meander-pattern stone pillars draped in golden-green moss at fixed positions left and right AND EXACTLY ONE sunlit open gap in the canopy overhead at a fixed position. Soft green light, glowing mossy hedge blocks. Ethereal fantasy couture editorial, serene and luminous.

**movement.static**
> The two models stand on the brick path in the green light, coats hanging crisp and still, moss glowing softly around them, dust motes drifting through the shaft of sun.

**Events**
- **Pose shift:** The two models angle toward each other, one hand each rising to a lapel, their meander patterns echoing the carved pillars, then hold the mirrored stance.
- **Runway circle:** One after the other, each model paces a slow circle on the brick path through the shaft of sunlight, his coat's geometry turning fully into view, then stills.
- **Group pose:** The two models square up side by side in the sunlit gap, chins level, coats aligned like a single carved relief, holding perfectly composed.

---

### 5.8 ZONE 9 — CLASSIC HEDGE GARDEN *(no photo yet — generate seed, spec below)*
**Anchor:** "the three models"

**base**
> Three fashion models of Caucasian, East Asian, and mixed heritage — slender and mid-size — in flowing pastel silk couture gowns with sculptural pleated bodices, standing on a gravel path in a formal emerald hedge maze. The world contains EXACTLY TWO tall manicured hedge walls at fixed positions left and right AND EXACTLY ONE white marble fountain straight ahead at a fixed position. Golden late-afternoon light, rose vines threading the hedges. Classic haute-couture garden editorial, romantic and pristine.

**movement.static**
> The three models stand poised on the gravel, silk hems lifting faintly in a soft breeze, the fountain's water shimmering steadily behind them.

**Events** — same three shapes: a synchronized pastel pose shift; one-by-one circles past the fountain; a triangular group pose on the fountain steps.

**Seed image prompt:** *A first-person still frame of three diverse fashion models in pastel silk couture gowns centred at medium distance on a gravel path in a formal emerald hedge maze, tall manicured hedge walls left and right, a white marble fountain behind them, golden late-afternoon light, rose vines in the hedges, 16:9, photorealistic editorial.*

---

### 5.9 ZONES 6 & 10 — see §6 (Gate Approach + Grand Finale, seed: image 6 + one generated water-runway seed)

---

### 5.10 OPTIONAL ZONE — SAUDI CYBERPUNK CROSSING *(you have additional project photos: Saudi Arabian male cyberpunk fashion)*
Build identically: base cast from the photo (thobe-inspired metallic couture, neon souk-arch corridor), the same three events, shared templates. This brings the distinct-look count to 10 with Zone 11 below.

### 5.11 DEAD-END VARIANT
Each dead end is a cheap base-swap of its parent zone: same style vocabulary, but the corridor **terminates**.

**base (Dead End A, op-art)**
> A short black-and-white op-art alcove sealed by EXACTLY ONE solid wall of concentric painted rings at a fixed position straight ahead, hexagonal marble floor, baroque frames on the side walls. Surreal op-art interior, hypnotic and stately.

React shows "Dead end — turn back" and reverses the maze-graph edge. (Time keeps ticking: that's the penalty.)

---

## 6. THE FINALE

### Zone 10 — GATE APPROACH
**Anchor:** "the golden gate"

**base**
> A monumental golden gate of two tall sliding panels, edged in white light, at the end of a dark corridor of pulsing color-shifting neon ribs. The world contains EXACTLY ONE golden gate straight ahead at a fixed position AND EXACTLY ONE glowing countdown ring above the gate at a fixed position. Haze, anticipatory spotlight beams. Cinematic event-entrance, electric.

**Timed event (React-driven, not player-held) — GATE CLOSING:** as the timer crosses thresholds, React appends escalating clauses:
- >2 min: *The two golden gate panels stand fully open, white edge-light steady, the corridor beyond glowing warmly.*
- ≤2 min: *The two golden gate panels slide slowly toward each other, the gap between them narrowing, edge-light pulsing faster.*
- 0: *The two golden gate panels seal shut with a heavy final glow, the countdown ring going dark.* → **LOSE screen** (React).

Cross the threshold before zero → fresh session seeds the finale.

### GRAND FINALE — WATER RUNWAY *(front-row spectacle; player seated, world performs)*
Seed: generate a water-runway frame (image 6 supplies the crowd/runway language; add water + pillars). *Seed prompt: A first-person front-row still frame of a mirror-flat water runway between tall white stone pillars in a vast dark arena, a model in sculptural couture walking on the water toward the viewer, packed fashionable audience rising on both sides, cool blue spotlights, 16:9, photorealistic.*

**Anchor:** "the runway"

**base**
> A grand finale fashion show on a mirror-flat water runway between tall white stone pillars in a vast dark arena, a couture model walking on the water's surface, ripples spreading from each step. The world contains EXACTLY ONE straight water runway at a fixed position ahead AND EXACTLY TWO banks of seated fashionable audience at fixed positions left and right. Cool blue spotlights, mist over the water. Spectacular cinematic runway, awe-struck.

**camera.static** (the player never walks here — front row): shared first-person static template, anchor = the runway. Omit the dynamic pair; movement input is disabled in React for this scene.

**movement.static**
> The model walks the water runway in long even strides toward the viewer, ripples fanning from each footfall, the audience utterly rapt, mist curling in the spotlight beams.

**Events — the show itself (React fires these in sequence as "looks", each a style act; ambiance changes around the seated player, exactly as you described):**
- **Look change / ambiance shift (environment transformation):** *The spotlights sweep from cool blue to molten gold as a new model in radiant Afrofuturist metallic couture strides onto the water, the pillars and mist re-lit in amber around the unchanged runway.* (Author one variant per zone-style: op-art white light, pink sequin wash, mossy green glow…)
- **Water spectacle (staged spectacle):** *Slender columns of illuminated water rise one by one from either side of the runway, arcing and falling back in sequence, staged clear of the model's path, droplets glittering in the beams.*
- **Sky installation (contextual entrance):** *The runway and audience remain the main scene, unchanged, while a huge sculptural chandelier of woven light lowers slowly from the darkness above the far end of the runway and holds.*
- **FIREWORKS FINALE (win event):** *Fireworks burst high above the arena in gold and magenta one after another, their reflections blooming across the water runway, confetti of light drifting down through the spotlight beams as every look holds for the final frame.* → React overlays score, camera roll gallery, WIN.

---

## 7. SEED IMAGES

- Zones 1–5, 7, 8: **use your uploaded project photos directly** (all 1456×816 ≈ 16:9 → model's 1664×960). Each base above is written *to describe its photo*, per the "image wins" rule.
- Zone 9, Dead ends, Gate, Finale: generate from the seed prompts given, deriving strictly from each base (same nouns, pinned landmarks, style tags; framing recast from camera.static as a still; models in the movement.static pose).

## 8. RUNTIME NOTES (from the skill — non-negotiable)

- Keep event holds **short**; return to a settled idle between them (drift accumulates on long holds — especially with sequins and mirrors).
- Worst-case compose per zone (base + dynamic camera + dynamic movement + two biggest events) must stay **under ~2000 chars** — the sets above budget for this; trim events first, never the base or contracts.
- Fresh sessions ignore input for the first seconds — React should hold the timer start until first stable frames per zone.
- Route sideways motion through turning; forward is the reliable axis (fits a maze perfectly).
- Restart the session before judging any prompt fix.

## 9. GAME CONFIG (React)

```
levels: [
  { id: 1, timerSec: 600, zones: [1,2,3,9,10] },
  { id: 2, timerSec: 480, zones: [1,4,5,7,8,10], deadEnds: ["A","B"] },
  { id: 3, timerSec: 360, zones: "full graph, both dead ends, extra junctions" }
]
scoring: coin = 10; photo = 25; photo during GROUP POSE = 75; timeBonus = secondsRemaining × 2
keys: WASD/arrows = move+look · 1 = pose shift · 2 = runway circle · 3 = group pose · P = photograph · Space = jump · C = crouch
```
