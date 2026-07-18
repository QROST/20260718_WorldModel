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

export type FashionMazeActionMode = "ambient" | "photo" | "photo-release";

export interface FashionMazeEnsembleMember {
  id: string;
  name: string;
  referenceImage: string;
  identityPrompt: string;
}

export interface FashionMazeEnsemble {
  count: number;
  members: FashionMazeEnsembleMember[];
  ambient: string;
}

export interface FashionMazePhotoAction {
  capture: string;
  release: string;
}

export interface FashionMaze {
  id: string;
  edition: string;
  title: string;
  subtitle: string;
  location: string;
  seedImage: string;
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

/**
 * First production content packet from 2026TheFashionMaze-Hack.
 *
 * The authored spec recommends first-person for its installation photographs,
 * but this packet's actual start frame is explicitly third-person and already
 * contains the player character. Image continuity wins: these prompts keep the
 * same blogger, suit, camera distance, and hedge geometry instead of asking the
 * world model to erase her on the first generated frame.
 */
export const fashionMazes: FashionMaze[] = [
  {
    id: "hedge-threshold",
    edition: "CHAPTER 01",
    title: "The Hedge Threshold",
    subtitle: "The invitation was never meant to be easy to find.",
    location: "Shanghai / Golden hour / Living couture",
    seedImage: "/dataset/hedge-threshold-plan-montage-v4.png",
    characterImage: "/dataset/fashion-blogger-character-sheet.png",
    characterName: "THE BLOGGER / LOOK 01",
    seed: 260718,
    accent: "#78f0cf",
    entrance: {
      eyebrow: "THE INVITATION",
      title: "You are late for the finale.",
      body:
        "A fashion PR handed you an envelope. The address led not to a venue, but to a living maze. Somewhere beyond the hedges, the season's final runway has already begun.",
    },
    basePrompt:
      "Continuous third-person fashion film in the same open-air couture hedge maze. BLOGGER is the same athletic deep-brown-skinned woman with short natural locs, seen from behind in her silver geometric bodysuit with teal inlays. Exactly one instance of each named supporting model persists. Preserve all four faces, bodies, hair, outfits, proportions, and the architecture. No arrivals, departures, duplicates, merging, role swaps, text, logos, cuts, or montage.",
    promptLayers: {
      camera: {
        still:
          "Camera stays fixed two metres behind BLOGGER at shoulder height. Live look may pan or tilt gently without camera translation, horizon change, or character-scale drift.",
        moving:
          "Camera follows smoothly two metres behind BLOGGER at shoulder height, matching her heading in one stabilized game shot; no orbit, cut, horizon change, or scale jump.",
      },
      movement: {
        still:
          "BLOGGER holds a calm ready stance with subtle breathing; her feet, hedges, terraces, and path stay anchored while leaves move slightly.",
        moving:
          "BLOGGER follows player input at a steady walk, feet grounded with coherent path parallax; architecture never slides or follows her.",
      },
    },
    ensemble: {
      count: 3,
      members: [
        {
          id: "M01_EMBER_COURT",
          name: "Ember Court",
          referenceImage:
            "/dataset/models/amber-brocade-character-sheet.png",
          identityPrompt:
            "plus-size East Asian woman; black sculptural double-bun hair; burnt-orange high neck; copper brocade asymmetric gown; gold platform stilettos",
        },
        {
          id: "M02_FOREST_TAILOR",
          name: "Forest Tailor",
          referenceImage:
            "/dataset/models/forest-tailoring-character-sheet.png",
          identityPrompt:
            "slim East Asian young man; side-swept black hair; grey-black leafless-forest suit; striped shirt; cropped trousers; black platform boots",
        },
        {
          id: "M03_SILVER_ARCHITECT",
          name: "Silver Architect",
          referenceImage:
            "/dataset/models/silver-sculptural-character-sheet.png",
          identityPrompt:
            "plus-size Black woman; short blonde afro; dark plum lips; crystal hoop earrings; silver grid dress with armored shoulders; silver platforms",
        },
      ],
      ambient:
        "The three models continuously inhabit anchored side zones with relaxed short walks, exchanged glances, and fabric touches. At unsynchronized intervals they drift onto varied-depth marks for a loose asymmetrical group pose, hold one shared breath, then peel away and resume wandering. Keep the central lane clear; no lineup, marching loop, teleport, entrance, exit, or frozen mannequins.",
    },
    photoAction: {
      capture:
        "For this photo chunk, override normal stance. BLOGGER stops, takes one slim phone from her hip, raises it with both hands, and taps the shutter once. The three models notice and settle at varied depths into a relaxed connected pose, never a lineup. Camera smoothly pushes from follow distance to a close over-shoulder view just above the phone, without a cut. End on a steady shutter hold with the phone at the lower edge.",
      release:
        "For this release chunk, BLOGGER lowers the same phone, returns it to her hip, and resumes her ready stance while camera eases back to its normal follow distance. The models break pose in staggered order and resume relaxed wandering and glances. No cut, duplicate phone, frozen cast, or identity change.",
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
            "Violet light threads through the living walls. Mirrored passages multiply the collection, but the woman walking through them remains unmistakably herself.",
        },
        promptDelta: {
          transition:
            "For this one forward approach, the garden ahead changes once into a neon mirror conservatory. Violet-magenta lights and flush mirror panels resolve within the existing hedges; one warm-yellow ring appears above the open path. Greenery, white concrete, all four people, and path geometry remain continuous.",
          settled:
            "Ahead is the settled neon mirror conservatory in the same hedge maze: fixed violet-magenta light columns, flush mirror panels in both hedge walls, and one warm-yellow ring above the open path. Greenery, white concrete, all four people, and path geometry remain fixed.",
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
            "Leaves follow seam lines. Sunlight catches every silver panel. The path ahead is both garden and runway, waiting for its first look.",
        },
        promptDelta: {
          transition:
            "For this one forward approach, the garden ahead reveals its living couture runway. Geometric seams resolve across both clipped hedges and one shallow mirror-water circle appears between fixed terraces. Golden light, rose vines, mist, all four people, and path remain continuous.",
          settled:
            "Ahead is the settled living couture runway: two fixed clipped hedges with geometric leaf seams and one shallow mirror-water circle between existing terraces. Golden light, rose vines, and mist reveal the silver-teal suit.",
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
            "For this one forward approach, the garden ahead changes once into its golden-circuit state. Amber-lit stone steps and two teal-gold inlays resolve within existing hedges and fixed white terraces. Warm light strengthens without replacing greenery, all four people, or architecture.",
          settled:
            "Ahead is the settled golden-circuit garden: one wide low amber-lit stone staircase between existing hedges, plus two teal-gold inlays fixed in white terrace walls. Warm light reflects across the pale path without replacing greenery.",
        },
      },
    ],
  },
];

const thirdPersonMovementContract =
  "Controls move only BLOGGER and her camera; architecture and cast marks stay anchored. Reflections are optical only, never extra people. Keep coherent gravity and one unbroken world.";

export function composeWorldPrompt(
  maze: FashionMaze,
  route?: MazeRoute,
  options: {
    isMoving?: boolean;
    isRouteTransition?: boolean;
    actionMode?: FashionMazeActionMode;
  } = {},
): string {
  const isMoving = options.isMoving ?? false;
  const isRouteTransition = options.isRouteTransition ?? false;
  const actionMode = options.actionMode ?? "ambient";
  const destination = route
    ? route.promptDelta[isRouteTransition ? "transition" : "settled"]
    : "At the threshold, one open path continues through the fixed hedge architecture. No world transformation has been applied yet.";
  const ensembleIdentities = maze.ensemble.members
    .map((member) => `${member.id}: ${member.identityPrompt}.`)
    .join(" ");
  const actionBehavior =
    actionMode === "photo"
      ? maze.photoAction.capture
      : actionMode === "photo-release"
        ? maze.photoAction.release
        : maze.ensemble.ambient;
  const cameraAndMovement =
    actionMode === "ambient"
      ? [
          maze.promptLayers.camera[isMoving ? "moving" : "still"],
          maze.promptLayers.movement[isMoving ? "moving" : "still"],
        ]
      : [];

  return [
    maze.basePrompt,
    ensembleIdentities,
    ...cameraAndMovement,
    destination,
    actionBehavior,
    thirdPersonMovementContract,
  ].join(" ");
}

export function findMaze(id: string): FashionMaze {
  return fashionMazes.find((maze) => maze.id === id) ?? fashionMazes[0];
}
