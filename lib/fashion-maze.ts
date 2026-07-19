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

export interface FashionMazeEnsembleMember {
  id: string;
  name: string;
  referenceImage?: string;
  identityPrompt: string;
}

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
  /** Reusable identity archetypes; variants may contain more instances. */
  members: FashionMazeEnsembleMember[];
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
  characterImage?: string;
  characterName?: string;
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

  const performers =
    performerCount === "all"
      ? "all seed-visible performers"
      : performerCount === 1
      ? "the one seed-visible performer"
      : `all ${performerCount} seed-visible performers`;

  return {
    beats: [
      {
        mode: "photo-ready",
        cue: "LOOK HERE",
        holdChunks: 2,
        prompt:
          `${performers} make the smallest head-and-neck turn needed for every face and both open eyes to look directly into the camera lens at the current first-person viewpoint. Only a backward-facing performer adds a slight upper-shoulder turn. Roots, supports, hands, limbs, props and spacing stay fixed. The portrait settles.`,
      },
      {
        mode: "photo-pose",
        cue: "HOLD",
        holdChunks: 3,
        prompt:
          `${performers} hold every face visible and front-facing to the camera lens at the current first-person viewpoint, with open eyes looking directly into the lens. Head, neck and upper shoulders stay steady; roots, supports, hands, limbs, props, costumes and spacing stay fixed.`,
      },
      {
        mode: "photo-shutter",
        cue: "SHUTTER",
        holdChunks: 2,
        prompt:
          `${performers} remain in one motionless portrait: every face is visible and front-facing to the camera lens at the current first-person viewpoint, with open eyes looking directly into the lens. Head and shoulder orientation, roots, supports, hands, limbs, props, costumes, depth and spacing stay stable.`,
      },
    ],
    release:
      `${performers} soften their gaze once and resume settled ambient behavior at their established marks, supports and limb poses.`,
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
    `One existing arch or doorway medium-far ahead is becoming the scene's single ornamental matte-black door in place, keeping its silhouette, supports and local detail while the opening deepens to lightless black; if none exists, one integrated frame is extending from nearby architecture, never freestanding, and the door is holding near centre at one sixth of frame height for ${PORTAL_CHOREOGRAPHY.summonHoldChunks} beats.`,
  enter:
    `The same ornamental matte-black doorway is holding its anchored place in existing architecture, its scene-native frame and supports staying coherent while the lightless interior conceals the destination.`,
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
    seedImage: "/dataset/rose-garden/entrance-01.png",
    seed: 260721,
    openingPrompt:
      "Seed marks: M01 elevated centre, M02 left, M03 seated right-centre, M04 far right, M05 front-centre among blush blocks. Preserve every seed limb arrangement; each foot keeps its seed-space position, height, angle, and contact state.",
  },
  {
    id: "rose-tableau-02",
    label: "Garden Procession",
    seedImage: "/dataset/rose-garden/entrance-02.png",
    seed: 260722,
    openingPrompt:
      "Seed marks: M01 high left, M02 left-centre, M03 in a static open-leg pose at centre, M04 leaning right-centre, M05 leaning far right. Preserve every seed limb arrangement; each foot keeps its seed-space position, height, angle, and contact state.",
  },
  {
    id: "rose-tableau-03",
    label: "Relaxed Montage",
    seedImage: "/dataset/rose-garden/entrance-03.png",
    seed: 260723,
    openingPrompt:
      "Seed marks: M01 reclining far left, M02 left-centre, M03 leaning at centre, M04 turned away right-centre, M05 low far right. Preserve every seed limb arrangement; each foot keeps its seed-space position, height, angle, and contact state.",
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
    characterName: "THE TAILORED HOST",
    accent: "#efa6d6",
    entrance: {
      eyebrow: "THE INVITATION",
      title: "You are late for the finale.",
      body:
        "An invitation led you into a rose garden where five guests have arrived in full couture. Between blush paths and a flowering canopy, every encounter becomes another composition of beauty.",
    },
    basePrompt:
      "Exactly five fashion performers form a couture tableau: M01 the crowned-gown woman, M02 the sari woman, M03 the tailored-suit man, M04 the lace-gown woman and M05 the prism-coat man, each with the seed face, body, hair and white-cobalt look. They occupy a blush geometric rose maze beneath pink wisteria in golden sunset light. Photorealistic luxury fashion editorial with coherent anatomy and material detail.",
    defaultDestinationPrompt:
      "The selected rose-garden tableau occupies the blush maze beneath the flowering canopy in its settled golden-hour state.",
    promptLayers: {
      movement:
        "All five sustain the completed seed limb arrangements, world roots, settled balance and support contacts. Rare asynchronous blinks, faint breathing, tiny eye or chin changes and gentle fabric settling keep the tableau alive.",
    },
    ensemble: {
      count: 5,
      members: [
        {
          id: "M01_CROWNED_SCULPTOR",
          name: "Crowned Sculptor",
          identityPrompt:
            "East Asian woman; blue-white geometric crown; asymmetric white-cobalt botanical gown; blue shoes",
        },
        {
          id: "M02_DRAPED_MUSE",
          name: "Draped Muse",
          identityPrompt:
            "dark-skinned South Asian woman; low black bun; draped white sari gown with cobalt botanical borders; blue boots",
        },
        {
          id: "M03_TAILORED_HOST",
          name: "Tailored Host",
          identityPrompt:
            "East Asian man; short swept black hair; tailored white-cobalt botanical suit; white shirt; blue shoes",
        },
        {
          id: "M04_LACE_ROMANTIC",
          name: "Lace Romantic",
          identityPrompt:
            "fair-skinned blonde woman; neat bun; white lace ballgown with cobalt botanical lines and long train; silver shoes",
        },
        {
          id: "M05_PRISM_WALKER",
          name: "Prism Walker",
          identityPrompt:
            "brown-skinned bearded man; close dark hair; long white coat with cobalt panels and cyan-magenta piping; white trousers; blue shoes",
        },
      ],
    },
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
            "For this one forward approach, the rose garden ahead changes once into a neon mirror conservatory. Violet-magenta lights and flush mirror panels resolve within existing blush maze walls; one warm-yellow ring appears above the open path. Flowers, all five people, and path geometry remain continuous.",
          settled:
            "Ahead is the settled neon mirror conservatory in the same rose garden: fixed violet-magenta light columns, flush mirror panels in the blush maze walls, and one warm-yellow ring above the open path. Flowers, all five people, and path geometry remain fixed.",
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
            "For this one forward approach, the garden ahead reveals its living couture runway. Geometric seams resolve across the blush maze walls and one shallow mirror-water circle appears between fixed paths. Golden light, wisteria, all five people, and the existing garden remain continuous.",
          settled:
            "Ahead is the settled living couture runway: fixed blush maze walls with geometric leaf seams and one shallow mirror-water circle between existing paths. Golden light and wisteria reveal every white-and-cobalt look.",
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
            "For this one forward approach, the garden ahead changes once into its golden-circuit state. Amber-lit low steps and two teal-gold inlays resolve within existing blush blocks. Warm light strengthens without replacing flowers, all five people, paths, or architecture.",
          settled:
            "Ahead is the settled golden-circuit garden: one wide low amber-lit staircase between existing blush maze walls, plus two teal-gold inlays fixed in the blocks. Warm light reflects across the pale path without replacing flowers or greenery.",
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
    seedImage: "/dataset/cyberpunk-garden/scene2.png",
    seed: 260724,
    openingPrompt:
      "Seed-space marks: C01 is low at far left; C02 leans left-centre with an arm extended diagonally; C03 stands centre with both arms raised; C04 kneels right-centre holding the helmet low; C05 stands far right with one arm extended. These are completed held silhouettes with their seed roots, depth, supports and spacing.",
    entranceVariants: [
      {
        id: "cyberpunk-scene-02",
        label: "Portal Formation",
        seedImage: "/dataset/cyberpunk-garden/scene2.png",
        seed: 260724,
        openingPrompt:
          "Seed-space marks: C01 is low at far left; C02 leans left-centre with an arm extended diagonally; C03 stands centre with both arms raised; C04 kneels right-centre holding the helmet low; C05 stands far right with one arm extended. These are completed held silhouettes with their seed roots, depth, supports and spacing.",
      },
      {
        id: "cyberpunk-scene-03b",
        label: "Signal Chorus",
        seedImage: "/dataset/cyberpunk-garden/scene3b.png",
        seed: 260725,
        openingPrompt:
          "Seed-space marks: C01 stands far left with one arm extended; C02 is left-centre with both arms raised near her headpiece; C03 holds the comparatively low-arm centre pose; C04 is behind right-centre with forearms behind his head; C05 kneels front-right with both arms overhead. These are completed held silhouettes with their seed roots, depth, supports and spacing.",
      },
      {
        id: "cyberpunk-scene-05",
        label: "Electric Tableau",
        seedImage: "/dataset/cyberpunk-garden/scene5.png",
        seed: 260726,
        openingPrompt:
          "Seed-space marks: C01 is far left with one lower leg lifted and arms low; C02 is left-centre with both arms overhead at her headpiece; C03 holds a deep back arch at centre with arms hanging low; C04 is right-centre holding the helmet overhead; C05 kneels far right with one hand at his face. These are completed held silhouettes with their seed roots, depth, supports and spacing.",
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
    basePrompt:
      "Exactly five performers occupy the circuit atrium: C01 the long-coat East Asian woman, C02 the red-haired headpiece woman, C03 the asymmetric-gown dark-haired woman, C04 the sculpted-armour Black man and C05 the sequined-top dark-haired man, each with the seed face, body, hair and black couture. The atrium contains one cyan circuit floor, overhead rails and three fixed magenta, blue and white portal bays. Photorealistic cinematic cyberpunk fashion editorial.",
    defaultDestinationPrompt:
      "The reflective circuit floor, three portal bays, dark wall panels and overhead rails form the settled seed atrium.",
    promptLayers: {
      movement:
        "Each performer sustains the completed pose shown in the selected seed, including every raised, extended, low or overhead arm arrangement, world root, support contact and prop position. Rare asynchronous blinks, tiny eye shifts and faint breathing keep the five silhouettes alive.",
    },
    ensemble: {
      count: 5,
      members: [
        {
          id: "C01_OBSIDIAN_SENTINEL",
          name: "Obsidian Sentinel",
          identityPrompt:
            "East Asian woman; straight black hair; long structured black coat; black gloves and heels",
        },
        {
          id: "C02_RED_SIGNAL",
          name: "Red Signal",
          identityPrompt:
            "fair-skinned woman; vivid red hair; angular black headpiece; fitted black sequined suit",
        },
        {
          id: "C03_MIDNIGHT_COLUMN",
          name: "Midnight Column",
          identityPrompt:
            "brown-skinned woman; dark hair; sculptural asymmetric black sequined gown",
        },
        {
          id: "C04_CIRCUIT_GUARD",
          name: "Circuit Guard",
          identityPrompt:
            "Black man; short natural hair; fitted sculpted black armour suit; black helmet prop when seed-visible",
        },
        {
          id: "C05_NEON_RUNNER",
          name: "Neon Runner",
          identityPrompt:
            "light olive-skinned man; short dark hair; black sequined long-sleeve top and black trousers",
        },
      ],
    },
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
    seedImage: "/dataset/asian-sculpture-garden/grand-finale.png",
    seed: 260727,
    openingPrompt:
      "Seed-space marks: S01 sits at the far-left foreground in the folded headdress; S02 is left-centre; S03 stands high at back-centre; S04 is centre-right with one raised forearm; S05 is right-centre in the white cape with forearms outward; S06 is far right. All six positions are completed held silhouettes with their seed roots, depth, supports and spacing.",
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
  basePrompt:
    "Exactly six performers form a silver-white couture finale: S01 the seated headdress woman, S02 the short-haired Black woman, S03 the tall dark-haired woman, S04 the silver-suit Black man, S05 the hooded cape-gown woman and S06 the bearded long-coat man, each with the seed face, body and hair. One central stone path crosses geometric hedges between conical topiary and green lattice pavilions in misty daylight. Photorealistic sculptural fashion editorial.",
  defaultDestinationPrompt:
    "The central stone path, clipped hedge geometry, topiary columns and distant lattice pavilions form the settled sculpture garden.",
  promptLayers: {
    movement:
      "All six sustain the completed seed silhouettes, world roots, support contacts, limb angles and hand positions; the raised forearms belong to held poses. Rare independent blinks, tiny eye shifts, faint breathing and slight fabric settling keep the ensemble alive.",
  },
  ensemble: {
    count: 6,
    members: [
      {
        id: "S01_FOLDED_ORACLE",
        name: "Folded Oracle",
        identityPrompt:
          "fair-skinned woman; dark hair beneath a large folded silver geometric headdress; seated silver sculptural gown",
      },
      {
        id: "S02_SILVER_BLOOM",
        name: "Silver Bloom",
        identityPrompt:
          "Black woman; short pale-blonde curls; structured silver mini dress with angular shoulders",
      },
      {
        id: "S03_GARDEN_COLUMN",
        name: "Garden Column",
        identityPrompt:
          "East Asian woman; dark hair; fitted silver high-neck gown with a circular sculptural overskirt",
      },
      {
        id: "S04_RAISED_SIGNAL",
        name: "Raised Signal",
        identityPrompt:
          "Black man; short hair; tailored geometric silver suit; one completed raised-forearm pose",
      },
      {
        id: "S05_IVORY_MONUMENT",
        name: "Ivory Monument",
        identityPrompt:
          "fair-skinned woman; ornate white hood; fitted white gown with long open geometric cape sleeves",
      },
      {
        id: "S06_QUIET_SENTINEL",
        name: "Quiet Sentinel",
        identityPrompt:
          "olive-skinned bearded man; short dark hair; structured ivory-silver long coat and trousers",
      },
    ],
  },
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
    seedImage: "/dataset/afro-futurism/scene-01.png",
    seed: 260728,
    ensembleCount: 5,
    openingPrompt:
      "Seed-space marks: A01 crouches far left in teal on stacked cubes; A02 holds a completed walking silhouette high at rear-centre in coral; A03 leans front-centre in floral pink on the crystal cube; A04 reclines right-centre in plum metallic; A05 stands high at far right in the coral long coat. All five retain their seed roots, depth, supports and spacing.",
  },
  {
    id: "afro-prism-02",
    label: "Seven-figure Prism Court",
    seedImage: "/dataset/afro-futurism/scene-02.png",
    seed: 260729,
    ensembleCount: 7,
    openingPrompt:
      "Seed-space marks: A01 crouches far left in plum; A02 stands left-centre in plum; A03 sits mid-left in floral pink; A04 leans high at centre in coral; A05 stands mid-right in teal with arms crossed; A06 kneels front-centre in coral; A07 holds a completed walking silhouette at far right in floral pink. All seven retain their seed roots, depth, supports and spacing.",
  },
  {
    id: "afro-prism-03",
    label: "Five-figure Voyage",
    seedImage: "/dataset/afro-futurism/scene-03.png",
    seed: 260730,
    ensembleCount: 5,
    openingPrompt:
      "Seed-space marks: A01 stands far left in plum; A02 leans left-centre in floral pink; A03 kneels at centre in coral; A04 holds a backward lean at right-centre in teal; A05 stands far right in the coral long coat. All five positions are completed held silhouettes with their seed roots, depth, supports and spacing.",
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
  basePrompt:
    "The seed-visible performers wear metallic coral, plum, floral-pink and teal tailored couture with boots and geometric head coverings, retaining their seed faces, bodies and hair. They occupy a cyber-pink prism maze with magenta-orange walls, transparent and metallic cubes, one reflective floor and seed-visible geometric signage. Photorealistic Afro-futurist fashion editorial with saturated neon light and precise material detail.",
  defaultDestinationPrompt:
    "The geometric corridor, mirrored platforms, luminous floor and repeating maze walls form the settled cyber-pink voyage.",
  promptLayers: {
    movement:
      "Every seed-visible performer sustains the completed platform pose, world root, support contact, limb arrangement and hand position shown in the selected seed. Rare independent blinks, tiny eye shifts, faint breathing and metallic fabric settling keep the tableau alive.",
  },
  ensemble: {
    count: 5,
    members: [
      {
        id: "A01_PLUM_SENTINEL",
        name: "Plum Sentinel",
        identityPrompt:
          "seed-visible performer in metallic plum tailored couture and geometric draped head covering",
      },
      {
        id: "A02_FLORAL_VOYAGER",
        name: "Floral Voyager",
        identityPrompt:
          "seed-visible performer in black-floral hot-pink tailored couture and matching head covering",
      },
      {
        id: "A03_CORAL_NAVIGATOR",
        name: "Coral Navigator",
        identityPrompt:
          "seed-visible performer in metallic coral tailored suit or long coat and matching head covering",
      },
      {
        id: "A04_TEAL_CARTOGRAPHER",
        name: "Teal Cartographer",
        identityPrompt:
          "dark-skinned seed-visible performer in metallic teal tailored couture and matching head covering",
      },
    ],
  },
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

const replaceableSeedBasePrompt =
  "Treat the selected seed image as the authoritative fashion world. Preserve all and only seed-visible people, their faces, bodies, hair, garments, accessories and props, together with seed-visible architecture, vegetation, installations, floor, lighting, palette and markings. Photorealistic fashion editorial with coherent anatomy, geometry and materials.";

const replaceableSeedAnchorPrompt =
  "The selected seed is the exact spatial anchor. Every seed-visible person and object keeps the seed-space world root, depth, scale, pose, support contact and spacing.";

const replaceableSeedDestinationPrompt =
  "The selected seed environment remains the settled world with its original depth, layout, lighting and materials.";

const replaceableSeedMovementPrompt =
  "Every seed-visible person retains the completed seed pose, world root, support contact, limb arrangement and spacing. Only rare asynchronous blinks, tiny eye shifts, faint breathing and fabric settling occur.";

function createReplaceableChapter(
  spec: ReplaceableChapterSpec,
): FashionMaze {
  const entranceVariants: FashionMazeEntranceVariant[] = spec.assets.map(
    (asset) => ({
      ...asset,
      openingPrompt: replaceableSeedAnchorPrompt,
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
    basePrompt: replaceableSeedBasePrompt,
    defaultDestinationPrompt: replaceableSeedDestinationPrompt,
    promptLayers: { movement: replaceableSeedMovementPrompt },
    ensemble: {
      count: first.ensembleCount ?? 0,
      members: [],
    },
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
      seedImage: "/dataset/scenes/chapter-05/scene-01.png",
      seed: 260731,
      ensembleCount: 5,
    },
    {
      id: "chapter-05-scene-02",
      label: "Scene 02",
      seedImage: "/dataset/scenes/chapter-05/scene-02.png",
      seed: 260732,
      ensembleCount: 7,
    },
    {
      id: "chapter-05-scene-03",
      label: "Scene 03",
      seedImage: "/dataset/scenes/chapter-05/scene-03.png",
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
      seedImage: "/dataset/scenes/chapter-06/scene-01.png",
      seed: 260734,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-02",
      label: "Scene 02",
      seedImage: "/dataset/scenes/chapter-06/scene-02.png",
      seed: 260735,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-03",
      label: "Scene 03",
      seedImage: "/dataset/scenes/chapter-06/scene-03.png",
      seed: 260736,
      ensembleCount: 5,
    },
    {
      id: "chapter-06-scene-04",
      label: "Scene 04",
      seedImage: "/dataset/scenes/chapter-06/scene-04.png",
      seed: 260737,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-05",
      label: "Scene 05",
      seedImage: "/dataset/scenes/chapter-06/scene-05.png",
      seed: 260738,
      ensembleCount: 6,
    },
    {
      id: "chapter-06-scene-06",
      label: "Scene 06",
      seedImage: "/dataset/scenes/chapter-06/scene-06.png",
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
      seedImage: "/dataset/scenes/chapter-07/scene-01.png",
      seed: 260740,
      ensembleCount: 6,
    },
    {
      id: "chapter-07-scene-02",
      label: "Scene 02",
      seedImage: "/dataset/scenes/chapter-07/scene-02.png",
      seed: 260741,
      ensembleCount: 6,
    },
    {
      id: "chapter-07-scene-03",
      label: "Scene 03",
      seedImage: "/dataset/scenes/chapter-07/scene-03.png",
      seed: 260742,
      ensembleCount: 5,
    },
    {
      id: "chapter-07-scene-04",
      label: "Scene 04",
      seedImage: "/dataset/scenes/chapter-07/scene-04.png",
      seed: 260743,
      ensembleCount: 5,
    },
    {
      id: "chapter-07-scene-05",
      label: "Scene 05",
      seedImage: "/dataset/scenes/chapter-07/scene-05.png",
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
  hard: 2_000,
  target: 1_800,
  base: 600,
  camera: 300,
  movement: 350,
  event: 500,
} as const;

const seedSpaceContract =
  "Seed directions are fixed world-space marks from the starting image; observer movement changes only their screen projection.";

const interactiveCameraContract =
  "Strict first-person observer view, stationary while movement input is idle and moving only while held input is active. Look input changes only observer heading; natural parallax reveals a visible world anchored in world space.";

const lockedCameraContract =
  "Strict first-person observer view locked at the current viewpoint with zero translation, rotation, cut or zoom.";

const forwardCameraContract =
  `First-person view moves straight through the centred ornamental black doorway for ${PORTAL_CHOREOGRAPHY.approachHoldChunks} chunks, with no lens zoom, yaw, roll, strafe or drift. Natural parallax enlarges it; the final 2 chunks cross the threshold and end fully inside its lightless interior.`;

const physicalContinuityContract =
  "Gravity, geometry, identities and materials stay coherent in one continuous world; reflections remain optical on visible surfaces.";

const emptyPhysicalContinuityContract =
  "Gravity, geometry and materials stay coherent in one continuous world; reflections remain optical on visible surfaces.";

const photoMovementContract =
  "The seed-visible ensemble retains established roots, supports, limb poses and spacing while the current photo direction controls gaze.";

const portalMovementContract =
  "The seed-visible ensemble keeps its completed pose, world roots, supports and spacing.";

const emptyPhotoMovementContract =
  "The seed-visible environment retains its established geometry, depth and materials throughout the photo beat.";

const emptyPortalMovementContract =
  "The seed-visible environment keeps its established geometry, depth and materials.";

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
    segment(
      "anchor",
      "anchor:world-space",
      "anchor · coordinates",
      seedSpaceContract,
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
      "anchor",
      "anchor:world-space",
      "anchor · coordinates",
      seedSpaceContract,
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
      "anchor",
      "anchor:world-space",
      "anchor · coordinates",
      seedSpaceContract,
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
