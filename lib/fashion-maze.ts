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

export interface PromptMotionLayer {
  still: string;
  moving: string;
}

export interface FashionMazePromptLayers {
  camera: PromptMotionLayer;
  movement: PromptMotionLayer;
}

export type FashionMazePhotoBeatMode =
  | "photo-ready"
  | "photo-one"
  | "photo-two"
  | "photo-three"
  | "photo-cheese"
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

export interface FashionMazeEntranceVariant {
  id: string;
  label: string;
  seedImage: string;
  seed: number;
  openingPrompt: string;
}

export interface FashionMazeEnsemble {
  count: number;
  members: FashionMazeEnsembleMember[];
  ambient: string;
}

export interface FashionMazePhotoBeat {
  mode: FashionMazePhotoBeatMode;
  cue: string;
  holdChunks: number;
  prompt: string;
}

export interface FashionMazePhotoAction {
  continuity: string;
  beats: FashionMazePhotoBeat[];
  release: string;
  releaseHoldChunks: number;
}

export interface FashionMaze {
  id: string;
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
  promptLayers: FashionMazePromptLayers;
  ensemble: FashionMazeEnsemble;
  photoAction: FashionMazePhotoAction;
  routes: MazeRoute[];
}

const roseGardenEntrances: FashionMazeEntranceVariant[] = [
  {
    id: "rose-tableau-01",
    label: "Finale Portrait",
    seedImage: "/dataset/rose-garden/entrance-01.png",
    seed: 260721,
    openingPrompt:
      "Seed marks: M01 elevated centre, M02 left, M03 seated right-centre, M04 far right, M05 front-centre among blush blocks. Each world-space root and footprint stays at its seed position.",
  },
  {
    id: "rose-tableau-02",
    label: "Garden Procession",
    seedImage: "/dataset/rose-garden/entrance-02.png",
    seed: 260722,
    openingPrompt:
      "Seed marks: M01 high left, M02 left-centre, M03 in a held extended-leg editorial stance at centre, M04 leaning right-centre, M05 in a held leaning stance far right. Each world-space root and footprint stays at its seed position. Both poses remain static; no step begins or completes.",
  },
  {
    id: "rose-tableau-03",
    label: "Relaxed Montage",
    seedImage: "/dataset/rose-garden/entrance-03.png",
    seed: 260723,
    openingPrompt:
      "Seed marks: M01 reclining far left, M02 left-centre, M03 leaning at centre, M04 turned away right-centre, M05 low far right. Each world-space root and footprint stays at its seed position.",
  },
];

/** The rose-garden packet keeps five seed-visible performers identity-locked. */
export const fashionMazes: FashionMaze[] = [
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
      "First-person observer world continuing the selected rose-garden entrance. Preserve exactly five seed performers M01-M05: crowned gown woman, sari woman, tailored-suit man M03, lace-gown woman, prism-coat man. Keep seed faces, bodies, hair, proportions and white-cobalt couture; never add a sixth. Seed directions are garden marks, never screen targets. Preserve blush maze, flowers, pink wisteria and sunset. No arrivals, exits, duplicates, merging, identity or costume swaps, cuts or new text.",
    promptLayers: {
      camera: {
        still:
          "First-person observer camera remains still while input is idle and never moves autonomously. Camera input never makes a performer walk, turn, follow, or compensate.",
        moving:
          "First-person observer camera, still while input is idle and moving only while camera input is held. Camera motion never makes a performer walk, turn, or follow.",
      },
      movement: {
        still:
          "All five keep fixed world-space roots and footprints. Only independent soft breathing, blinking, tiny head or hand-to-hip changes, and faint fabric settling occur.",
        moving:
          "All five keep fixed world-space roots and footprints. Screen position, scale, or angle may change only through camera parallax and perspective, never performer motion or compensation.",
      },
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
      ambient:
        "One relaxed fashion-show tableau. All five stay on exact marks. Independently and irregularly, one or two may breathe, blink, adjust a hand or head, or briefly glance toward the lens. Camera motion never drives gaze or body. No stepping, approaching, tracking, synchronized gaze, waving, regrouping, loops or stiffness.",
    },
    photoAction: {
      continuity:
        "Continue the exact frame: HOST M03, one phone, four subjects, faces, outfits, and garden unchanged. Observer camera and every world-space root stay fixed, so each person keeps the same camera distance, depth, and screen zone; all four subjects remain separately visible. They pose only with gaze, head, shoulders, hands, or a few degrees of torso angle. From READY through shutter they look at the phone lens. No steps, approach, wave, arm sweep, deep lean, crouch, jump, camera move, zoom, cut, teleport, duplicate, role, identity, prop change, or new text.",
      beats: [
        {
          mode: "photo-ready",
          cue: "READY",
          holdChunks: 3,
          prompt:
            "Start once, then hold. HOST keeps both feet planted, draws the phone from his right hip, and raises it to eye level. Keep all four subjects visible in the exact wide frame. They look at the phone lens and settle once into restrained poses: M01 hand at waist, M02 hand along her drape, M04 hand lightly at hip, M05 fingers at his lapel. Hold exact marks; no large movement or shutter yet.",
        },
        {
          mode: "photo-one",
          cue: "1",
          holdChunks: 2,
          prompt:
            "Count one once, then hold. HOST keeps the phone upright and shows one clear index finger close beside it, without a broad arm gesture. The four subjects keep their individual poses and phone-lens gaze; only a tiny chin or shoulder settling is allowed.",
        },
        {
          mode: "photo-two",
          cue: "2",
          holdChunks: 2,
          prompt:
            "Count two once, then hold. HOST changes only the nearby counting hand into a clear V sign. The four keep exact footprints, restrained hand placements, and gaze into the phone lens; only a few degrees of head angle may refine each pose.",
        },
        {
          mode: "photo-three",
          cue: "3",
          holdChunks: 2,
          prompt:
            "Count three once, then hold. HOST shows three clearly spread fingers close to the same phone. The four remain rooted, look into its lens, and add only soft smiles plus tiny chin or shoulder refinements. Hold every pose and the same framing.",
        },
        {
          mode: "photo-cheese",
          cue: "CHEESE!",
          holdChunks: 3,
          prompt:
            "HOST returns the counting hand to the phone and braces it with both hands without leaning forward. The four look directly into the phone lens, brighten into soft natural smiles, and hold their distinct relaxed fashion poses for a full beat. Only breathing and blinking continue; no shutter yet.",
        },
        {
          mode: "photo-shutter",
          cue: "SHUTTER",
          holdChunks: 2,
          prompt:
            "Press the shutter exactly once with one small readable thumb press while the phone stays steady. The four models maintain phone-lens eye contact, soft smiles, and their restrained poses through the click. End in a steady two-handed photo hold; no repeated press, flash transformation, or camera shake.",
        },
      ],
      release:
        "After one satisfied holding beat, HOST lowers and returns the phone to his right hip while the observer camera stays fixed. The four stay on exact marks, relax their lens gaze and hand poses, then resume independent micro-movements without walking.",
      releaseHoldChunks: 3,
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
];

const stillWorldContract =
  "With movement input idle, camera and all five character roots have zero spatial translation. Reflections are optical only, never extra people. Keep coherent gravity and one unbroken world.";

const movingWorldContract =
  "Controls move only the invisible observer camera. All five roots and the garden stay independently anchored; camera motion never drives body motion or gaze. Reflections are optical, not people. Keep coherent gravity and one continuous world.";

const actionWorldContract =
  "Reflections are optical only, never extra people. Keep coherent gravity, physical continuity, and one unbroken world.";

export function composeWorldPrompt(
  maze: FashionMaze,
  route?: MazeRoute,
  options: {
    isMoving?: boolean;
    isRouteTransition?: boolean;
    actionMode?: FashionMazeActionMode;
    includeOpeningAnchor?: boolean;
  } = {},
): string {
  const isMoving = options.isMoving ?? false;
  const isRouteTransition = options.isRouteTransition ?? false;
  const actionMode = options.actionMode ?? "ambient";
  const includeOpeningAnchor = options.includeOpeningAnchor ?? false;
  const destination = route
    ? route.promptDelta[isRouteTransition ? "transition" : "settled"]
    : "The selected rose-garden tableau continues within the fixed blush maze and flowering canopy. No world transformation has been applied yet.";
  const photoBeat = maze.photoAction.beats.find(
    (beat) => beat.mode === actionMode,
  );
  const actionBehavior =
    actionMode === "photo-release"
      ? `${maze.photoAction.release} ${maze.photoAction.continuity}`
      : photoBeat
        ? `${photoBeat.prompt} ${maze.photoAction.continuity}`
        : maze.ensemble.ambient;
  const cameraAndMovement =
    actionMode === "ambient"
      ? [
          maze.promptLayers.camera[isMoving ? "moving" : "still"],
          maze.promptLayers.movement[isMoving ? "moving" : "still"],
        ]
      : [];
  const worldContract =
    actionMode === "ambient"
      ? isMoving
        ? movingWorldContract
        : stillWorldContract
      : actionWorldContract;

  return [
    maze.basePrompt,
    includeOpeningAnchor ? maze.openingPrompt : "",
    ...cameraAndMovement,
    destination,
    actionBehavior,
    worldContract,
  ]
    .filter(Boolean)
    .join(" ");
}

export function findMaze(id: string): FashionMaze {
  return fashionMazes.find((maze) => maze.id === id) ?? fashionMazes[0];
}

export function resolveMazeEntrance(
  maze: FashionMaze,
  entranceVariantId: string,
): FashionMaze {
  const variant =
    maze.entranceVariants.find((candidate) => candidate.id === entranceVariantId) ??
    maze.entranceVariants[0];
  if (!variant) return maze;

  return {
    ...maze,
    seedImage: variant.seedImage,
    seed: variant.seed,
    openingPrompt: variant.openingPrompt,
    entranceVariantId: variant.id,
  };
}
