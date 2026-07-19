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

export interface FashionMazeSceneTransition {
  targetSceneId: string;
  buttonLabel: string;
  continuity?: string;
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
      continuity:
        "Continue the exact current frame and environment. Hold all architecture, terrain, vegetation, lighting, reflections and props in their current world positions. The invisible observer-camera is the only camera; do not add a photographer, phone, camera, person, object, text, cut or zoom.",
      beats: [
        {
          mode: "photo-ready",
          cue: "LOOK HERE",
          holdChunks: 2,
          prompt:
            "Prepare the current environment as a still photograph. Keep the observer-camera and the complete world steady with no new motion or composition change.",
        },
        {
          mode: "photo-pose",
          cue: "HOLD",
          holdChunks: 3,
          prompt:
            "Hold the finished environmental frame unchanged. Preserve the exact camera, geometry, lighting, depth and reflections.",
        },
        {
          mode: "photo-shutter",
          cue: "SHUTTER",
          holdChunks: 2,
          prompt:
            "Capture one clean still frame of the same environment. Nothing enters, leaves, moves, transforms or changes depth while the observer-camera remains fixed.",
        },
      ],
      release:
        "After one holding beat, continue the exact ambient environment from the same observer-camera position without introducing any new action.",
      releaseHoldChunks: 2,
    };
  }

  const performers =
    performerCount === 1
      ? "the one seed-visible performer"
      : `all ${performerCount} seed-visible performers`;

  return {
    continuity:
      `Exact current frame; ${performers} retain identities, costumes, props, roots, depth, spacing, supports and limb poses. Only eyes and heads may turn toward the invisible observer-camera; use a slight shoulder or upper-torso turn only when needed. Feet, legs, hips, balance and hands stay fixed. No new person or object, step, gesture, cut, zoom, swap or duplicate.`,
    beats: [
      {
        mode: "photo-ready",
        cue: "LOOK HERE",
        holdChunks: 2,
        prompt:
          `${performers} look toward the observer-camera with a small eye-and-head turn. A backward-facing subject may turn shoulders slightly, but pelvis, feet, legs, balance, hands, roots and spacing stay fixed. Preserve the pose; then gaze-lock.`,
      },
      {
        mode: "photo-pose",
        cue: "HOLD",
        holdChunks: 3,
        prompt:
          `${performers} hold their established poses and lens-directed gaze. Keep bodies, support contacts, spacing, hands, costumes and props fixed; only an occasional blink may occur.`,
      },
      {
        mode: "photo-shutter",
        cue: "SHUTTER",
        holdChunks: 2,
        prompt:
          `Capture one clean still frame of ${performers} in the same composition. Keep the observer-camera and world steady; nobody enters, leaves, gestures, changes pose or changes depth.`,
      },
    ],
    release:
      `${performers} keep the same marks, support contacts and limb poses. Gaze may relax once, then everyone resumes the scene's exact ambient hold with no new action.`,
    releaseHoldChunks: 2,
  };
}

const forwardBlackDoorPortal: FashionMazeSceneTransition["portal"] = {
  summon:
    "One unmistakable human-scale black door-gate is now fully present far ahead on a clear straight sightline, about eight metres from the observer and precisely centred on the current camera-forward axis. Show its complete freestanding silhouette small but clear at the exact centre of the frame: two thick dark-metal jambs, one solid lintel, shallow footings, and a faint cool rim light tracing the outer edges. It is visually distinct from every existing arch or portal bay. Its open interior is perfectly matte black and reveals no destination. Hold the gate fixed there for two full beats while the observer camera remains perfectly still. All seed-visible performers remain rooted in their exact poses. No side-positioned gate, hidden gate, paper-thin frame, duplicate arch, camera turn, cut, zoom, text, or scene transformation.",
  enter:
    "Continue the exact same world and one fixed black door-gate centred far ahead. Only the first-person observer camera walks forward very slowly and steadily along the camera-forward axis. Keep zero yaw, pitch, roll, strafe or sideways drift; the centred gate grows gradually across multiple chunks. Cross the threshold and continue until both jambs and lintel pass completely behind the observer, outside every image edge. Only then may the entire view become uniform light-absorbing black. All seed-visible performers stay rooted and never follow or change pose. Reveal no destination. No turn, cut, dissolve, teleport, speed jump, extra gate, text, or scene transformation before complete full-frame black.",
};

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
      "First-person observer world continuing the selected rose-garden entrance. Preserve exactly five seed performers M01-M05: crowned gown woman, sari woman, tailored-suit man M03, lace-gown woman, prism-coat man. Keep seed faces, bodies, hair, proportions and white-cobalt couture; never add a sixth. Seed directions are garden marks, never screen targets. Preserve blush maze, flowers, pink wisteria and sunset. No arrivals, exits, duplicates, merging, identity or costume swaps, cuts or new text.",
    defaultDestinationPrompt:
      "The selected rose-garden tableau continues within the fixed blush maze and flowering canopy. No world transformation has been applied yet.",
    promptLayers: {
      camera: {
        still:
          "First-person observer camera remains still while input is idle and never moves autonomously. Camera input never makes a performer walk, turn, follow, or compensate.",
        moving:
          "First-person observer camera, still while input is idle and moving only while camera input is held. Camera motion never makes a performer walk, turn, or follow.",
      },
      movement: {
        still:
          "All five sustain the exact seed limb arrangement and settled balance. Every foot keeps its position, height, angle, and contact state. No foot lift, landing, tap, shuffle, weight transfer, knee pumping, step in place, pacing, or gait. Only rare blinks, faint breathing, tiny eye or chin changes, and fabric settling occur.",
        moving:
          "All five keep roots, limb poses, and every foot's position, height, angle, and contact state fixed. Screen changes come only from camera parallax, never gait, leg motion, or body compensation.",
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
        "Poised fashion-show finale tableau. All five sustain one pose; most frames stay unchanged. Rarely, one model may blink, breathe faintly, shift eyes, or angle chin a few degrees. Limb arrangement, foot contact, legs, hips, balance, and hands never change. No shuffle, weight transfer, step-in-place, pacing, gait, approach, tracking, waving, regrouping, or motion loop.",
    },
    sceneTransition: {
      targetSceneId: "cyberpunk-garden",
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
      "Seed marks describe world positions only: C01 low far left; C02 leaning left-centre; C03 upright centre; C04 kneeling right-centre; C05 standing far right. Lock roots, depth, spacing, supported knees, feet, lower-body contacts and torso balance. Completed arm state: all hands rest at or below waist, elbows close to torso, shoulders relaxed; the helmet rests by thigh or lap. Hold unchanged.",
    entranceVariants: [
      {
        id: "cyberpunk-scene-02",
        label: "Portal Formation",
        seedImage: "/dataset/cyberpunk-garden/scene2.png",
        seed: 260724,
        openingPrompt:
          "Seed marks describe world positions only: C01 low far left; C02 leaning left-centre; C03 upright centre; C04 kneeling right-centre; C05 standing far right. Lock roots, depth, spacing, supported knees, feet, lower-body contacts and torso balance. Completed arm state: all hands rest at or below waist, elbows close to torso, shoulders relaxed; the helmet rests by thigh or lap. Hold unchanged.",
      },
      {
        id: "cyberpunk-scene-03b",
        label: "Signal Chorus",
        seedImage: "/dataset/cyberpunk-garden/scene3b.png",
        seed: 260725,
        openingPrompt:
          "Seed marks describe world positions only: C01 far left; C02 left-centre; C03 centre; C04 behind right-centre; C05 kneeling front-right. Lock roots, depth, spacing, supported knees, feet, lower-body contacts and torso balance. Completed arm state: all hands rest at or below waist, elbows close to torso and shoulders relaxed. Hold unchanged.",
      },
      {
        id: "cyberpunk-scene-05",
        label: "Electric Tableau",
        seedImage: "/dataset/cyberpunk-garden/scene5.png",
        seed: 260726,
        openingPrompt:
          "Seed marks describe world positions only: C01 far left with the seed lower-leg lift; C02 left-centre; C03 in the completed back-arched torso balance at centre; C04 right-centre; C05 kneeling far right. Lock roots, depth, spacing, supported knees, lifted foot, lower-body contacts and torso balance. Completed arm state: all hands rest at or below waist, elbows close to torso, shoulders relaxed; the helmet rests by the thigh. Hold unchanged.",
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
      "Photorealistic first-person continuation of the selected cyberpunk seed. Preserve exactly five performers C01-C05—the long-coat East Asian woman, red-haired headpiece woman, asymmetric-gown dark-haired woman, sculpted-armour Black man and sequined-top dark-haired man—with the same faces, bodies, hair, proportions and black couture. All sustain distinct quiet low-arm holds; no upper-limb choreography, imitation or synchronized gesture. Preserve the circuit atrium, cyan grid floor, overhead rails and fixed magenta, blue and white portal bays. No sixth person, removal, duplicate, merge, swap, arrival, exit, cut, new prop or text.",
    defaultDestinationPrompt:
      "The settled seed atrium remains unchanged: reflective circuit floor, three portal bays, dark wall panels and overhead rails stay fixed; no new structure appears.",
    promptLayers: {
      camera: {
        still:
          "The observer camera stays still while input is idle, with no autonomous drift, pan or zoom. Camera input never makes a performer compensate or follow.",
        moving:
          "The observer camera moves only while input is held, with natural parallax and no autonomous turn or zoom. It never drives performer motion.",
      },
      movement: {
        still:
          "Lock all roots, depth, spacing, feet, knees and lower-body contacts. Hands remain at or below waist, elbows close, shoulders relaxed and any helmet low. Motion is limited to rare blinks, eye shifts and faint breathing; arms, hands and fingers stay still. No weight shift, foot exchange, pose completion, gesture cycle or loop.",
        moving:
          "Lock all roots, depth, spacing and lower-body support. Completed low-arm holds remain unchanged: hands at or below waist, elbows close, shoulders relaxed and any helmet low. Observer-camera parallax is the only screen change; nobody tracks, compensates, gestures or copies another pose.",
      },
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
      ambient:
        "Fixed cyberpunk fashion tableau. All five sustain distinct low-arm poses and support contacts: hands at or below waist, elbows close, shoulders relaxed, helmet by thigh or lap. Only asynchronous blinks, tiny eye shifts and faint breathing occur; arms, wrists, hands and fingers stay still. No raised-arm pose, reach, wave, flourish, shared gesture, pose completion, step, weight transfer, approach or camera tracking.",
    },
    sceneTransition: {
      targetSceneId: "chapter-03",
      buttonLabel: "ENTER THE NEXT BLACK DOOR",
      continuity:
        "C01-C05 keep the same identities, black couture, world roots, depth, spacing, feet, knees, support contacts and quiet low-arm holds. The circuit atrium and its existing coloured portal bays remain fixed. Nobody reacts, gestures, follows or changes pose.",
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
      "Six fixed seed marks: S01 seated far-left foreground in the folded headdress; S02 left-centre; S03 high at back-centre; S04 centre-right with one raised forearm; S05 right-centre in the white cape with forearms outward; S06 far right. Lock roots, depth, spacing, supports, feet, limb angles and hands. S04 and S05 arm positions are completed static silhouettes: never lift, lower, wave, repeat or trigger imitation.",
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
    "Photorealistic first-person Asian sculpture-garden grand finale. Preserve six S01-S06, their faces, bodies, hair, proportions and silver-white geometric couture: seated headdress woman, short-haired Black woman, tall dark-haired woman, silver-suit Black man, hooded cape-gown woman and bearded long-coat man. Preserve stone paths, geometric hedges, conical topiary, green lattice pavilions and misty daylight. No seventh person, removal, duplicate, merge, identity or costume swap, arrival, exit, cut, prop or text.",
  defaultDestinationPrompt:
    "The settled sculpture garden remains unchanged: the central stone path, clipped hedge geometry, topiary columns and distant lattice pavilions stay fixed.",
  promptLayers: {
    camera: {
      still:
        "The observer camera stays still while input is idle, with no autonomous drift, pan or zoom. Camera input never makes a performer react or compensate.",
      moving:
        "The observer camera moves only while input is held, with natural parallax and no autonomous turn or zoom. It never drives performer motion.",
    },
    movement: {
      still:
        "All six lock exact roots, depth, spacing, supports, feet, limb angles and hands. The two seed-visible raised-arm silhouettes remain finished static poses, never gestures. Only rare blinks, tiny eye shifts and faint breathing occur; no step, weight transfer, pose cycle or imitation.",
      moving:
        "All six retain exact world roots, support contacts, limb poses and hand positions. Observer-camera parallax is the only screen change; nobody follows, turns, gestures, repeats an arm motion or copies another pose.",
    },
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
    ambient:
      "Fixed six-person finale. Everyone sustains the seed silhouette and supports; S04 and S05 arm positions remain motionless, never waving, lowering, repeating or prompting imitation. Only rare independent blinks, tiny eye shifts and faint breathing occur. No step, weight transfer, approach, gesture loop or camera tracking.",
  },
  sceneTransition: {
    targetSceneId: "chapter-04",
    buttonLabel: "ENTER THE NEXT BLACK DOOR",
    continuity:
      "S01-S06 keep the same identities, silver-white couture, roots, depth, spacing, supports, feet and finished limb poses. The sculpture garden, topiary and pavilions remain fixed. Nobody gestures, follows or changes pose.",
    portal: forwardBlackDoorPortal,
  },
  routes: [],
};

const chapterFourPlaceholder: FashionMaze = {
  ...roseGardenChapterOne,
  id: "chapter-04",
  entrySelectable: false,
  edition: "CHAPTER 04",
  title: "The Rose Garden Encore",
  subtitle: "A familiar garden holds the place of the fourth world.",
  location: "Rose garden encore / Temporary Chapter 04",
  entrance: {
    eyebrow: "BEYOND THE THIRD BLACK DOOR",
    title: "The garden returns for an encore.",
    body:
      "This temporary fourth chapter reuses the first rose-garden image set while its own images are being prepared.",
  },
  sceneTransition: undefined,
  routes: [],
};

export const fashionMazes: FashionMaze[] = [
  ...authoredFashionMazes,
  chapterThreeAsianSculptureGarden,
  chapterFourPlaceholder,
];

const stillWorldContract =
  "With movement input idle, the observer camera and all scene geometry have zero spatial translation. Reflections are optical only. Keep coherent gravity and one unbroken world.";

const movingWorldContract =
  "Controls move only the invisible observer camera. All scene geometry stays independently anchored; camera motion never drives subject or environmental motion. Reflections are optical. Keep coherent gravity and one continuous world.";

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
    : maze.defaultDestinationPrompt;
  const photoAction = resolvePhotoAction(maze);
  const photoBeat = photoAction.beats.find(
    (beat) => beat.mode === actionMode,
  );
  const actionBehavior =
    actionMode === "photo-release"
      ? `${photoAction.release} ${photoAction.continuity}`
      : photoBeat
        ? `${photoBeat.prompt} ${photoAction.continuity}`
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

export function composePortalPrompt(
  maze: FashionMaze,
  route: MazeRoute | undefined,
  stage: "summon" | "enter",
): string {
  const transition = maze.sceneTransition;
  if (!transition) return composeWorldPrompt(maze, route, {
    isMoving: stage === "enter",
    includeOpeningAnchor: true,
  });

  return [
    maze.basePrompt,
    transition.continuity ?? maze.openingPrompt,
    route ? route.promptDelta.settled : "",
    transition.portal[stage],
    stage === "enter" ? movingWorldContract : stillWorldContract,
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
