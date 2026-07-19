// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

export interface NarrativeBeat {
  eyebrow: string;
  title: string;
  body: string;
}

export interface MazeRoute {
  id: string;
  direction: string;
  navigation: "left" | "forward" | "right";
  title: string;
  teaser: string;
  accent: string;
  narrative: NarrativeBeat;
  promptDelta: {
    transition: string;
    settled: string;
  };
}

export interface FashionMazePromptLayers {
  /** Subject behavior only. Camera and world identity live in other layers. */
  movement: string;
}

export type FashionMazePromptSegmentKind =
  | "base"
  | "anchor"
  | "camera"
  | "movement"
  | "destination"
  | "event"
  | "continuity";

export interface FashionMazePromptSegment {
  kind: FashionMazePromptSegmentKind;
  id: string;
  label: string;
  text: string;
}

export type FashionMazePhotoBeatMode =
  | "photo-ready"
  | "photo-pose"
  | "photo-shutter";

export type FashionMazeActionMode =
  | "ambient"
  | FashionMazePhotoBeatMode
  | "photo-release";

export type FashionMazeEnsembleCount = number | "all";

export interface FashionMazeEntranceVariant {
  id: string;
  label: string;
  seedImage: string;
  seed: number;
  openingPrompt: string;
  ensembleCount?: FashionMazeEnsembleCount;
}

export interface FashionMazeEnsemble {
  count: FashionMazeEnsembleCount;
}

export interface FashionMazePhotoBeat {
  mode: FashionMazePhotoBeatMode;
  cue: string;
  holdChunks: number;
  prompt: string;
}

export interface FashionMazePhotoAction {
  beats: FashionMazePhotoBeat[];
  release: string;
  releaseHoldChunks: number;
}

export interface FashionMazeDoorChoice {
  id: string;
  label: string;
}

export interface FashionMazeDoorQuestion {
  prompt: string;
  choices: [FashionMazeDoorChoice, FashionMazeDoorChoice];
}

export interface FashionMazeSceneTransition {
  buttonLabel: string;
  portal: {
    summon: string;
    enter: string;
  };
}

export interface FashionMaze {
  id: string;
  entrySelectable?: boolean;
  edition: string;
  title: string;
  subtitle: string;
  location: string;
  seedImage: string;
  openingPrompt: string;
  entranceVariants: FashionMazeEntranceVariant[];
  entranceVariantId?: string;
  seed: number;
  accent: string;
  entrance: NarrativeBeat;
  basePrompt: string;
  defaultDestinationPrompt: string;
  promptLayers: FashionMazePromptLayers;
  ensemble: FashionMazeEnsemble;
  photoAction?: FashionMazePhotoAction;
  sceneTransition?: FashionMazeSceneTransition;
  routes: MazeRoute[];
}

export const SEED_WORLD_BASE_PROMPT =
  "The seed is visual truth. Preserve every seed-visible identity, face, body, hair, garment, accessory and prop, plus its environment, materials and lighting.";

export const SEED_WORLD_ANCHOR_PROMPT =
  "Keep seed-visible subjects and objects at their shown world root, depth, scale, pose, support, limb arrangement and spacing.";

export const SEED_WORLD_DESTINATION_PROMPT =
  "Keep the seed world unchanged.";

export const SEED_WORLD_MOVEMENT_PROMPT =
  "Allow only rare blinks, faint breathing, fabric settling and event-light variation.";

/**
 * Every chapter can take a photo without authoring scene-specific choreography.
 * A chapter may still override this when its subjects need unusual direction.
 */
export function resolvePhotoAction(
  maze: Pick<FashionMaze, "ensemble" | "photoAction">,
): FashionMazePhotoAction {
  if (maze.photoAction) return maze.photoAction;

  const performerCount = maze.ensemble.count;
  if (performerCount === 0) {
    return {
      beats: [
        {
          mode: "photo-ready",
          cue: "FRAME",
          holdChunks: 1,
          prompt:
            "The current environment settles into a balanced still composition at the present viewpoint.",
        },
        {
          mode: "photo-pose",
          cue: "HOLD",
          holdChunks: 1,
          prompt:
            "The finished environmental composition holds steady with stable geometry, lighting, depth and reflections.",
        },
        {
          mode: "photo-shutter",
          cue: "SHUTTER",
          holdChunks: 1,
          prompt:
            "The finished environmental composition remains motionless for this beat with stable light, depth and reflections.",
        },
      ],
      release:
        "Ambient environmental micro-motion resumes gently from the same settled composition.",
      releaseHoldChunks: 1,
    };
  }

  return {
    beats: [
      {
        mode: "photo-ready",
        cue: "LOOK HERE",
        holdChunks: 2,
        prompt:
          "Have all seed-visible performers turn face and head only as needed, with open eyes looking directly into the camera lens at the current first-person viewpoint. A backward-facing performer may add a slight upper-shoulder turn. Keep roots, supports, limbs, props and spacing unchanged.",
      },
      {
        mode: "photo-pose",
        cue: "HOLD",
        holdChunks: 3,
        prompt:
          "Keep all seed-visible performers in a camera-facing portrait, with open eyes looking directly into the camera lens at the current first-person viewpoint. Keep body pose, position, clothing and props unchanged.",
      },
      {
        mode: "photo-shutter",
        cue: "SHUTTER",
        holdChunks: 2,
        prompt:
          "Keep all seed-visible performers still in a camera-facing portrait, with open eyes looking directly into the camera lens at the current first-person viewpoint. Keep body pose, position, clothing and props unchanged.",
      },
    ],
    release:
      "Seed-visible performers relax their gaze and resume subtle natural motion without changing pose or position.",
    releaseHoldChunks: 1,
  };
}

export const PORTAL_CHOREOGRAPHY = {
  summonHoldChunks: 3,
  approachHoldChunks: 8,
  clientZoomMs: 1_800,
} as const;

const forwardBlackDoorPortal: FashionMazeSceneTransition["portal"] = {
  summon:
    "An existing arch or doorway medium-far ahead is becoming a richly ornamental scene-native frame at an approachable scale, with elaborate carving around a threshold into pure darkness; it keeps its roots and supports, or is forming within nearby architecture if none exists, never freestanding.",
  enter:
    "The same richly ornamental frame stays fixed in the architecture; beyond its threshold is only uniform, featureless pure darkness with no visible light, image, detail or destination.",
};

/**
 * One unique editorial decision for every authored scene, including the last
 * black door into the generated Grand Palais finale. These questions are tied
 * to journey position instead of a source/target pair because Scenes 2–7 are
 * shuffled at the start of each run.
 */
export const fashionDoorQuestions: FashionMazeDoorQuestion[] = [
  {
    prompt: "What should lead the next frame?",
    choices: [
      { id: "decisive_silhouette", label: "A decisive silhouette" },
      { id: "immersive_atmosphere", label: "An immersive atmosphere" },
    ],
  },
  {
    prompt: "How should the collection gather momentum?",
    choices: [
      { id: "precise_stillness", label: "Through precise stillness" },
      { id: "unfolding_motion", label: "Through unfolding motion" },
    ],
  },
  {
    prompt: "Where should the future find its shape?",
    choices: [
      { id: "inherited_craft", label: "Within inherited craft" },
      { id: "radical_invention", label: "Through radical invention" },
    ],
  },
  {
    prompt: "What should survive a change of world?",
    choices: [
      { id: "material_language", label: "The material language" },
      { id: "human_gesture", label: "The human gesture" },
    ],
  },
  {
    prompt: "How should contrast become continuity?",
    choices: [
      { id: "shared_rhythm", label: "By sharing a rhythm" },
      { id: "preserved_tension", label: "By preserving tension" },
    ],
  },
  {
    prompt: "What makes an arrival feel inevitable?",
    choices: [
      { id: "echoed_detail", label: "One echoed detail" },
      { id: "sudden_reveal", label: "One sudden reveal" },
    ],
  },
  {
    prompt: "What carries the journey into its finale?",
    choices: [
      { id: "memory_every_look", label: "The memory of every look" },
      { id: "promise_unknown", label: "The promise of the unknown" },
    ],
  },
];

const roseGardenEntrances: FashionMazeEntranceVariant[] = [
  {
    id: "rose-tableau-01",
    label: "Finale Portrait",
    seedImage: "/dataset/rose-garden/entrance-01.webp",
    seed: 260721,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
  {
    id: "rose-tableau-02",
    label: "Garden Procession",
    seedImage: "/dataset/rose-garden/entrance-02.webp",
    seed: 260722,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
  {
    id: "rose-tableau-03",
    label: "Relaxed Montage",
    seedImage: "/dataset/rose-garden/entrance-03.webp",
    seed: 260723,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
];

/** The authored chapters keep every seed-visible performer identity-locked. */
const authoredFashionMazes: FashionMaze[] = [
  {
    id: "rose-garden",
    edition: "CHAPTER 01",
    title: "The Rose Garden",
    subtitle: "Five looks. One living composition.",
    location: "Rose garden / Golden hour / Living couture",
    seedImage: roseGardenEntrances[0].seedImage,
    seed: roseGardenEntrances[0].seed,
    openingPrompt: roseGardenEntrances[0].openingPrompt,
    entranceVariants: roseGardenEntrances,
    entranceVariantId: roseGardenEntrances[0].id,
    accent: "#efa6d6",
    entrance: {
      eyebrow: "THE INVITATION",
      title: "You are late for the finale.",
      body:
        "An invitation led you into a rose garden where five guests have arrived in full couture. Between blush paths and a flowering canopy, every encounter becomes another composition of beauty.",
    },
    basePrompt: SEED_WORLD_BASE_PROMPT,
    defaultDestinationPrompt: SEED_WORLD_DESTINATION_PROMPT,
    promptLayers: {
      movement: SEED_WORLD_MOVEMENT_PROMPT,
    },
    ensemble: { count: 5 },
    sceneTransition: {
      buttonLabel: "ENTER THE BLACK DOOR",
      portal: forwardBlackDoorPortal,
    },
    routes: [
      {
        id: "neon-canopy",
        direction: "NEON",
        navigation: "forward",
        title: "Awaken the neon canopy",
        teaser: "The garden remembers midnight.",
        accent: "#ee62ff",
        narrative: {
          eyebrow: "NEON MIRROR ATRIUM",
          title: "Every reflection arrives before you do.",
          body:
            "Violet light threads through the flowering canopy. Mirrored passages multiply the collection, but every member of the ensemble remains unmistakably themselves.",
        },
        promptDelta: {
          transition:
            "Ahead, existing garden surfaces shift to violet light and mirror panels. Keep seed-visible people, flowers and paths unchanged.",
          settled:
            "Ahead is the settled neon garden with violet light and mirror panels. Keep seed-visible people, flowers and paths unchanged.",
        },
      },
      {
        id: "living-runway",
        direction: "GARDEN",
        navigation: "forward",
        title: "Reveal the living runway",
        teaser: "The hedge becomes couture.",
        accent: "#78f0cf",
        narrative: {
          eyebrow: "CLASSIC HEDGE GARDEN",
          title: "The maze has been tailoring itself.",
          body:
            "Leaves follow seam lines. Sunlight catches every cobalt detail. The path ahead is both garden and runway, waiting for its next composition.",
        },
        promptDelta: {
          transition:
            "Ahead, leaf seams and a shallow mirror pool form within existing garden surfaces. Keep seed-visible people, flowers and paths unchanged.",
          settled:
            "Ahead is the settled garden runway with leaf seams and a shallow mirror pool. Keep seed-visible people, flowers and paths unchanged.",
        },
      },
      {
        id: "golden-circuit",
        direction: "CIRCUIT",
        navigation: "forward",
        title: "Approach the golden circuit",
        teaser: "Technology grows a garden.",
        accent: "#ffc65c",
        narrative: {
          eyebrow: "GOLDEN CIRCUIT STAIRWAY",
          title: "The route answers in amber light.",
          body:
            "A staircase wakes inside the vines. Its circuitry does not replace the garden; it reveals the current that was already running beneath it.",
        },
        promptDelta: {
          transition:
            "Ahead, low amber steps and teal-gold inlays form within existing garden surfaces. Keep seed-visible people, flowers and paths unchanged.",
          settled:
            "Ahead is the settled golden-circuit garden with low amber steps and teal-gold inlays. Keep seed-visible people, flowers and paths unchanged.",
        },
      },
    ],
  },
  {
    id: "cyberpunk-garden",
    entrySelectable: false,
    edition: "CHAPTER 02",
    title: "The Cyberpunk Garden",
    subtitle: "Five silhouettes hold the portal atrium.",
    location: "Cyberpunk garden / Portal atrium / Electric midnight",
    seedImage: "/dataset/cyberpunk-garden/scene2.webp",
    seed: 260724,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
    entranceVariants: [
      {
        id: "cyberpunk-scene-02",
        label: "Portal Formation",
        seedImage: "/dataset/cyberpunk-garden/scene2.webp",
        seed: 260724,
        openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
      },
      {
        id: "cyberpunk-scene-03b",
        label: "Signal Chorus",
        seedImage: "/dataset/cyberpunk-garden/scene3b.webp",
        seed: 260725,
        openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
      },
      {
        id: "cyberpunk-scene-05",
        label: "Electric Tableau",
        seedImage: "/dataset/cyberpunk-garden/scene5.webp",
        seed: 260726,
        openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
      },
    ],
    entranceVariantId: "cyberpunk-scene-02",
    accent: "#65e7ff",
    entrance: {
      eyebrow: "BEYOND THE BLACK DOOR",
      title: "The runway has crossed the circuit.",
      body:
        "Darkness opens onto an electric atrium where five black-clad figures hold a precise formation between magenta, blue and white portals.",
    },
    basePrompt: SEED_WORLD_BASE_PROMPT,
    defaultDestinationPrompt: SEED_WORLD_DESTINATION_PROMPT,
    promptLayers: {
      movement: SEED_WORLD_MOVEMENT_PROMPT,
    },
    ensemble: { count: 5 },
    sceneTransition: {
      buttonLabel: "ENTER THE NEXT BLACK DOOR",
      portal: forwardBlackDoorPortal,
    },
    routes: [],
  },
];

const roseGardenChapterOne = authoredFashionMazes.find(
  (maze) => maze.id === "rose-garden",
);

if (!roseGardenChapterOne) {
  throw new Error("The Chapter 01 rose-garden scene is required.");
}

const asianSculptureGardenEntrances: FashionMazeEntranceVariant[] = [
  {
    id: "asian-sculpture-grand-finale",
    label: "Grand Finale",
    seedImage: "/dataset/asian-sculpture-garden/grand-finale.webp",
    seed: 260727,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
];

const chapterThreeAsianSculptureGarden: FashionMaze = {
  id: "chapter-03",
  entrySelectable: false,
  edition: "CHAPTER 03",
  title: "The Asian Sculpture Garden",
  subtitle: "Six silver silhouettes hold the grand finale.",
  location: "Asian sculpture garden / Grand finale / Misty daylight",
  seedImage: asianSculptureGardenEntrances[0].seedImage,
  seed: asianSculptureGardenEntrances[0].seed,
  openingPrompt: asianSculptureGardenEntrances[0].openingPrompt,
  entranceVariants: asianSculptureGardenEntrances,
  entranceVariantId: asianSculptureGardenEntrances[0].id,
  accent: "#c9dda7",
  entrance: {
    eyebrow: "BEYOND THE SECOND BLACK DOOR",
    title: "The garden has become a living monument.",
    body:
      "Six figures in silver and white hold a grand-finale composition among immense topiary columns, geometric hedges and misty garden pavilions.",
  },
  basePrompt: SEED_WORLD_BASE_PROMPT,
  defaultDestinationPrompt: SEED_WORLD_DESTINATION_PROMPT,
  promptLayers: {
    movement: SEED_WORLD_MOVEMENT_PROMPT,
  },
  ensemble: { count: 6 },
  sceneTransition: {
    buttonLabel: "ENTER THE NEXT BLACK DOOR",
    portal: forwardBlackDoorPortal,
  },
  routes: [],
};

const afroFuturismEntrances: FashionMazeEntranceVariant[] = [
  {
    id: "afro-prism-01",
    label: "Cyber-Pink Platforms",
    seedImage: "/dataset/afro-futurism/scene-01.webp",
    seed: 260728,
    ensembleCount: 5,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
  {
    id: "afro-prism-02",
    label: "Seven-figure Prism Court",
    seedImage: "/dataset/afro-futurism/scene-02.webp",
    seed: 260729,
    ensembleCount: 7,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
  {
    id: "afro-prism-03",
    label: "Five-figure Voyage",
    seedImage: "/dataset/afro-futurism/scene-03.webp",
    seed: 260730,
    ensembleCount: 5,
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
  },
];

const chapterFourAfroFuturism: FashionMaze = {
  id: "chapter-04",
  entrySelectable: false,
  edition: "CHAPTER 04",
  title: "The Afro-Futurist Prism",
  subtitle: "Metallic travelers hold the cyber-pink voyage.",
  location: "Afro-futurist prism maze / Cyber-pink voyage",
  seedImage: afroFuturismEntrances[0].seedImage,
  seed: afroFuturismEntrances[0].seed,
  openingPrompt: afroFuturismEntrances[0].openingPrompt,
  entranceVariants: afroFuturismEntrances,
  entranceVariantId: afroFuturismEntrances[0].id,
  accent: "#ff4fa7",
  entrance: {
    eyebrow: "BEYOND THE THIRD BLACK DOOR",
    title: "The voyage folds space into color.",
    body:
      "Metallic travelers hold impossible poses across mirrored cubes while a cyber-pink geometric corridor repeats toward infinity.",
  },
  basePrompt: SEED_WORLD_BASE_PROMPT,
  defaultDestinationPrompt: SEED_WORLD_DESTINATION_PROMPT,
  promptLayers: {
    movement: SEED_WORLD_MOVEMENT_PROMPT,
  },
  ensemble: { count: 5 },
  sceneTransition: {
    buttonLabel: "ENTER THE NEXT BLACK DOOR",
    portal: forwardBlackDoorPortal,
  },
  routes: [],
};

interface ReplaceableSeedAsset {
  id: string;
  label: string;
  seedImage: string;
  seed: number;
  ensembleCount: number;
}

interface ReplaceableChapterSpec {
  id: string;
  edition: string;
  title: string;
  subtitle: string;
  location: string;
  accent: string;
  entrance: NarrativeBeat;
  assets: ReplaceableSeedAsset[];
}

function createReplaceableChapter(
  spec: ReplaceableChapterSpec,
): FashionMaze {
  const entranceVariants: FashionMazeEntranceVariant[] = spec.assets.map(
    (asset) => ({
      ...asset,
      openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
    }),
  );
  const first = entranceVariants[0];
  if (!first) {
    throw new Error(`Scene "${spec.id}" requires at least one seed asset.`);
  }
  return {
    id: spec.id,
    entrySelectable: false,
    edition: spec.edition,
    title: spec.title,
    subtitle: spec.subtitle,
    location: spec.location,
    seedImage: first.seedImage,
    seed: first.seed,
    openingPrompt: first.openingPrompt,
    entranceVariants,
    entranceVariantId: first.id,
    accent: spec.accent,
    entrance: spec.entrance,
    basePrompt: SEED_WORLD_BASE_PROMPT,
    defaultDestinationPrompt: SEED_WORLD_DESTINATION_PROMPT,
    promptLayers: { movement: SEED_WORLD_MOVEMENT_PROMPT },
    ensemble: { count: first.ensembleCount ?? 0 },
    sceneTransition: {
      buttonLabel: "ENTER THE NEXT BLACK DOOR",
      portal: forwardBlackDoorPortal,
    },
    routes: [],
  };
}

const chapterFiveAfroFuturism = createReplaceableChapter({
  id: "chapter-05",
  edition: "CHAPTER 05",
  title: "The Afro-Futurist Continuum",
  subtitle: "A second prism holds a new composition.",
  location: "Afro-futurist prism / Seed-led continuation",
  accent: "#ff6b9f",
  entrance: {
    eyebrow: "BEYOND THE FOURTH BLACK DOOR",
    title: "The prism continues in another arrangement.",
    body:
      "A new seed-led composition carries the metallic ensemble through the same luminous visual language.",
  },
  assets: [
    {
      id: "chapter-05-scene-01",
      label: "Scene 01",
      seedImage: "/dataset/scenes/chapter-05/scene-01.webp",
      seed: 260731,
      ensembleCount: 5,
    },
    {
      id: "chapter-05-scene-02",
      label: "Scene 02",
      seedImage: "/dataset/scenes/chapter-05/scene-02.webp",
      seed: 260732,
      ensembleCount: 7,
    },
    {
      id: "chapter-05-scene-03",
      label: "Scene 03",
      seedImage: "/dataset/scenes/chapter-05/scene-03.webp",
      seed: 260733,
      ensembleCount: 5,
    },
  ],
});

const chapterSixAsianSculptureGarden = createReplaceableChapter({
  id: "chapter-06",
  edition: "CHAPTER 06",
  title: "The Silver Topiary Gallery",
  subtitle: "Silver silhouettes inhabit the clipped garden.",
  location: "Asian sculpture garden / Seed-led gallery",
  accent: "#b8d49a",
  entrance: {
    eyebrow: "BEYOND THE FIFTH BLACK DOOR",
    title: "The path returns as a gallery.",
    body:
      "Silver figures hold distinct arrangements among topiary corridors, glass platforms and flowering thresholds.",
  },
  assets: [
    {
      id: "chapter-06-scene-01",
      label: "Scene 01",
      seedImage: "/dataset/scenes/chapter-06/scene-01.webp",
      seed: 260734,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-02",
      label: "Scene 02",
      seedImage: "/dataset/scenes/chapter-06/scene-02.webp",
      seed: 260735,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-03",
      label: "Scene 03",
      seedImage: "/dataset/scenes/chapter-06/scene-03.webp",
      seed: 260736,
      ensembleCount: 5,
    },
    {
      id: "chapter-06-scene-04",
      label: "Scene 04",
      seedImage: "/dataset/scenes/chapter-06/scene-04.webp",
      seed: 260737,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-05",
      label: "Scene 05",
      seedImage: "/dataset/scenes/chapter-06/scene-05.webp",
      seed: 260738,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-06",
      label: "Scene 06",
      seedImage: "/dataset/scenes/chapter-06/scene-06.webp",
      seed: 260739,
      ensembleCount: 6,
    },
  ],
});

const chapterSevenAsianFusion = createReplaceableChapter({
  id: "chapter-07",
  edition: "CHAPTER 07",
  title: "The Copper Ring Foundry",
  subtitle: "Copper couture holds the industrial circles.",
  location: "Asian-fusion foundry / Seed-led finale",
  accent: "#ee7935",
  entrance: {
    eyebrow: "BEYOND THE SIXTH BLACK DOOR",
    title: "The final frame is forged in rings.",
    body:
      "Copper-orange performers occupy monumental circles inside an industrial fashion installation.",
  },
  assets: [
    {
      id: "chapter-07-scene-01",
      label: "Scene 01",
      seedImage: "/dataset/scenes/chapter-07/scene-01.webp",
      seed: 260740,
      ensembleCount: 6,
    },
    {
      id: "chapter-07-scene-02",
      label: "Scene 02",
      seedImage: "/dataset/scenes/chapter-07/scene-02.webp",
      seed: 260741,
      ensembleCount: 6,
    },
    {
      id: "chapter-07-scene-03",
      label: "Scene 03",
      seedImage: "/dataset/scenes/chapter-07/scene-03.webp",
      seed: 260742,
      ensembleCount: 5,
    },
    {
      id: "chapter-07-scene-04",
      label: "Scene 04",
      seedImage: "/dataset/scenes/chapter-07/scene-04.webp",
      seed: 260743,
      ensembleCount: 5,
    },
    {
      id: "chapter-07-scene-05",
      label: "Scene 05",
      seedImage: "/dataset/scenes/chapter-07/scene-05.webp",
      seed: 260744,
      ensembleCount: 6,
    },
  ],
});

export const fashionMazes: FashionMaze[] = [
  ...authoredFashionMazes,
  chapterThreeAsianSculptureGarden,
  chapterFourAfroFuturism,
  chapterFiveAfroFuturism,
  chapterSixAsianSculptureGarden,
  chapterSevenAsianFusion,
];

/** Build one deterministic run order from the random number drawn at Start. */
export function createFashionMazeSceneOrder(seed: number): string[] {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("The scene-order seed must be a non-negative integer.");
  }
  const first = fashionMazes[0];
  if (!first) throw new Error("At least one Fashion Maze scene is required.");

  let state = (seed >>> 0) || 0x6d2b79f5;
  const randomUnit = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const tail = fashionMazes.slice(1).map((maze) => maze.id);
  for (let index = tail.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomUnit() * (index + 1));
    [tail[index], tail[swapIndex]] = [tail[swapIndex], tail[index]];
  }
  return [first.id, ...tail];
}

/** Fail closed when a client-supplied journey is incomplete or reordered at Scene 1. */
export function assertFashionMazeSceneOrder(
  sceneOrderIds: readonly string[],
): void {
  const expectedIds = fashionMazes.map((maze) => maze.id);
  if (
    sceneOrderIds.length !== expectedIds.length ||
    sceneOrderIds[0] !== expectedIds[0] ||
    new Set(sceneOrderIds).size !== expectedIds.length ||
    expectedIds.some((id) => !sceneOrderIds.includes(id))
  ) {
    throw new Error(
      "The journey must contain Scene 1 first and every authored scene exactly once.",
    );
  }
}

export const FASHION_MAZE_PROMPT_BUDGET = {
  hard: 1_200,
  target: 1_000,
  base: 220,
  anchor: 220,
  camera: 220,
  movement: 180,
  destination: 180,
  event: 300,
  continuity: 100,
} as const;

const interactiveCameraContract =
  "First-person camera stays still without input and moves only with held input. Look input changes heading only.";

const lockedCameraContract =
  "Lock the first-person camera at its current position and angle. No translation, rotation, cut or zoom.";

const forwardCameraContract =
  `Move the first-person camera through the centred doorway for ${PORTAL_CHOREOGRAPHY.approachHoldChunks} chunks. No zoom, yaw, roll, strafe or drift; natural parallax enlarges it. Cross the threshold in the final 2 chunks and finish fully inside pure darkness.`;

const physicalContinuityContract =
  "Keep geometry, identities and materials coherent.";

const emptyPhysicalContinuityContract =
  "Keep geometry and materials coherent.";

const photoMovementContract =
  "Keep seed-visible bodies, poses, positions and supports unchanged.";

const portalMovementContract =
  "Keep seed-visible poses, positions and supports unchanged.";

const emptyPhotoMovementContract =
  "Keep the seed environment unchanged during the photo beat.";

const emptyPortalMovementContract =
  "Keep the seed environment unchanged.";

function continuityContractFor(maze: FashionMaze): string {
  return maze.ensemble.count === 0
    ? emptyPhysicalContinuityContract
    : physicalContinuityContract;
}

export interface FashionMazePromptOptions {
  isRouteTransition?: boolean;
  actionMode?: FashionMazeActionMode;
}

function segment(
  kind: FashionMazePromptSegmentKind,
  id: string,
  label: string,
  text: string,
): FashionMazePromptSegment {
  return { kind, id, label, text: text.trim() };
}

export function joinFashionMazePromptSegments(
  segments: FashionMazePromptSegment[],
): string {
  return segments
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ");
}

export function composeWorldPromptSegments(
  maze: FashionMaze,
  route?: MazeRoute,
  options: FashionMazePromptOptions = {},
): FashionMazePromptSegment[] {
  const isRouteTransition = options.isRouteTransition ?? false;
  const actionMode = options.actionMode ?? "ambient";
  if (isRouteTransition && !route) {
    throw new Error("A route transition prompt requires an explicit route.");
  }
  if (isRouteTransition && actionMode !== "ambient") {
    throw new Error(
      `Route transition and ${actionMode} are mutually exclusive prompt events.`,
    );
  }
  const destination = route
    ? route.promptDelta[isRouteTransition ? "transition" : "settled"]
    : maze.defaultDestinationPrompt;
  const photoAction = resolvePhotoAction(maze);
  const photoBeat = photoAction.beats.find(
    (beat) => beat.mode === actionMode,
  );
  const camera =
    actionMode === "ambient"
      ? segment(
          "camera",
          "camera:interactive",
          "camera · interactive",
          interactiveCameraContract,
        )
      : segment(
          "camera",
          "camera:locked",
          "camera · locked",
          lockedCameraContract,
        );
  const destinationKind =
    route && isRouteTransition ? "event" : "destination";
  const movement =
    actionMode === "ambient"
      ? {
          id: `movement:${maze.id}`,
          label: "movement · settled",
          text: maze.promptLayers.movement,
        }
      : {
          id: "movement:photo",
          label: "movement · photo",
          text:
            maze.ensemble.count === 0
              ? emptyPhotoMovementContract
              : photoMovementContract,
        };
  const segments = [
    segment("base", `base:${maze.id}`, "base · world", maze.basePrompt),
    segment(
      "anchor",
      `anchor:${maze.entranceVariantId ?? "default"}`,
      "anchor · seed",
      maze.openingPrompt,
    ),
    camera,
    segment(
      "movement",
      movement.id,
      movement.label,
      movement.text,
    ),
    segment(
      destinationKind,
      route
        ? `route:${route.id}:${isRouteTransition ? "transition" : "settled"}`
        : `destination:${maze.id}`,
      route
        ? `route · ${route.id} · ${isRouteTransition ? "transition" : "settled"}`
        : "destination · settled",
      destination,
    ),
  ];

  if (photoBeat) {
    segments.push(
      segment(
        "event",
        `photo:${photoBeat.mode}`,
        `event · ${photoBeat.mode}`,
        photoBeat.prompt,
      ),
    );
  } else if (actionMode === "photo-release") {
    segments.push(
      segment(
        "event",
        "photo:release",
        "event · photo-release",
        photoAction.release,
      ),
    );
  }

  segments.push(
    segment(
      "continuity",
      "continuity:physical",
      "continuity · physical",
      continuityContractFor(maze),
    ),
  );
  return segments.filter((item) => item.text.length > 0);
}

export function composeWorldPrompt(
  maze: FashionMaze,
  route?: MazeRoute,
  options: FashionMazePromptOptions = {},
): string {
  return joinFashionMazePromptSegments(
    composeWorldPromptSegments(maze, route, options),
  );
}

export function composePortalPromptSegments(
  maze: FashionMaze,
  route: MazeRoute | undefined,
  stage: "summon" | "enter",
): FashionMazePromptSegment[] {
  const transition = maze.sceneTransition;
  if (!transition) {
    throw new Error(`Scene "${maze.id}" does not define a portal transition.`);
  }

  return [
    segment("base", `base:${maze.id}`, "base · world", maze.basePrompt),
    segment(
      "anchor",
      `anchor:${maze.entranceVariantId ?? "default"}`,
      "anchor · seed",
      maze.openingPrompt,
    ),
    segment(
      "camera",
      stage === "enter" ? "camera:forward" : "camera:locked",
      `camera · ${stage === "enter" ? "forward" : "locked"}`,
      stage === "enter" ? forwardCameraContract : lockedCameraContract,
    ),
    segment(
      "movement",
      "movement:portal",
      "movement · portal",
      maze.ensemble.count === 0
        ? emptyPortalMovementContract
        : portalMovementContract,
    ),
    segment(
      "destination",
      route ? `route:${route.id}:settled` : `destination:${maze.id}`,
      route ? `route · ${route.id} · settled` : "destination · settled",
      route ? route.promptDelta.settled : maze.defaultDestinationPrompt,
    ),
    segment(
      "event",
      `portal:${stage}`,
      `event · portal-${stage}`,
      transition.portal[stage],
    ),
    segment(
      "continuity",
      "continuity:physical",
      "continuity · physical",
      continuityContractFor(maze),
    ),
  ].filter((item) => item.text.length > 0);
}

export function composePortalPrompt(
  maze: FashionMaze,
  route: MazeRoute | undefined,
  stage: "summon" | "enter",
): string {
  return joinFashionMazePromptSegments(
    composePortalPromptSegments(maze, route, stage),
  );
}

export function explainFashionMazePrompt(
  maze: FashionMaze,
  prompt: string,
): FashionMazePromptSegment[] {
  const photoAction = resolvePhotoAction(maze);
  const candidates: FashionMazePromptSegment[] = [
    segment("base", `base:${maze.id}`, "base · world", maze.basePrompt),
    segment(
      "anchor",
      `anchor:${maze.entranceVariantId ?? "default"}`,
      "anchor · seed",
      maze.openingPrompt,
    ),
    segment(
      "camera",
      "camera:interactive",
      "camera · interactive",
      interactiveCameraContract,
    ),
    segment(
      "camera",
      "camera:locked",
      "camera · locked",
      lockedCameraContract,
    ),
    segment(
      "camera",
      "camera:forward",
      "camera · forward",
      forwardCameraContract,
    ),
    segment(
      "movement",
      `movement:${maze.id}`,
      "movement · settled",
      maze.promptLayers.movement,
    ),
    segment(
      "movement",
      "movement:photo",
      "movement · photo",
      maze.ensemble.count === 0
        ? emptyPhotoMovementContract
        : photoMovementContract,
    ),
    segment(
      "movement",
      "movement:portal",
      "movement · portal",
      maze.ensemble.count === 0
        ? emptyPortalMovementContract
        : portalMovementContract,
    ),
    segment(
      "destination",
      `destination:${maze.id}`,
      "destination · settled",
      maze.defaultDestinationPrompt,
    ),
    ...maze.routes.flatMap((route) => [
      segment(
        "event",
        `route:${route.id}:transition`,
        `route · ${route.id} · transition`,
        route.promptDelta.transition,
      ),
      segment(
        "destination",
        `route:${route.id}:settled`,
        `route · ${route.id} · settled`,
        route.promptDelta.settled,
      ),
    ]),
    ...photoAction.beats.map((beat) =>
      segment(
        "event",
        `photo:${beat.mode}`,
        `event · ${beat.mode}`,
        beat.prompt,
      ),
    ),
    segment(
      "event",
      "photo:release",
      "event · photo-release",
      photoAction.release,
    ),
    ...(maze.sceneTransition
      ? (["summon", "enter"] as const).map((stage) =>
          segment(
            "event",
            `portal:${stage}`,
            `event · portal-${stage}`,
            maze.sceneTransition!.portal[stage],
          ),
        )
      : []),
    segment(
      "continuity",
      "continuity:physical",
      "continuity · physical",
      continuityContractFor(maze),
    ),
  ];
  const unique = Array.from(
    new Map(candidates.map((item) => [item.text, item])).values(),
  );
  const matched = unique
    .map((item) => ({ item, index: prompt.indexOf(item.text) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);

  if (joinFashionMazePromptSegments(matched) === prompt.trim()) return matched;
  return [
    segment(
      "event",
      "prompt:unclassified",
      "active prompt · unclassified",
      prompt,
    ),
  ];
}

export function findMaze(id: string): FashionMaze {
  const maze = fashionMazes.find((candidate) => candidate.id === id);
  if (!maze) throw new Error(`Unknown Fashion Maze scene "${id}".`);
  return maze;
}

export function resolveMazeEntrance(
  maze: FashionMaze,
  entranceVariantId: string,
): FashionMaze {
  const fallback = maze.entranceVariants[0];
  if (!fallback) {
    throw new Error(`Scene "${maze.id}" has no entrance variant.`);
  }
  const variant = entranceVariantId
    ? maze.entranceVariants.find(
        (candidate) => candidate.id === entranceVariantId,
      )
    : fallback;
  if (!variant) {
    throw new Error(
      `Unknown entrance variant "${entranceVariantId}" for scene "${maze.id}".`,
    );
  }

  return {
    ...maze,
    seedImage: variant.seedImage,
    seed: variant.seed,
    openingPrompt: variant.openingPrompt,
    entranceVariantId: variant.id,
    ensemble:
      variant.ensembleCount === undefined
        ? maze.ensemble
        : { ...maze.ensemble, count: variant.ensembleCount },
  };
}
