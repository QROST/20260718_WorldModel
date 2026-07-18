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

export type EnsembleSettledState = "wander" | "pose";
export type EnsemblePromptMode =
  | EnsembleSettledState
  | "assemble"
  | "release";

export interface FashionMazeEnsemble {
  count: number;
  wander: string;
  assemble: string;
  pose: string;
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
    seedImage: "/dataset/hedge-threshold.png",
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
      "A continuous third-person interactive fashion film in an open-air couture hedge maze. The same six physical people persist: EXACTLY ONE fashion blogger stays centred in the foreground with her back to camera, an athletic woman with deep brown skin and short natural locs in the same fitted silver geometric bodysuit with teal inlays, structured shoulders, forearm guards, and silver boots; EXACTLY FIVE distinct supporting fashion models in jewel-toned couture occupy five assigned midground side zones. Preserve all six identities, bodies, outfits, proportions, and the reference architecture. No arrivals, departures, duplicates, merging, role swaps, text, logos, cuts, or montage.",
    promptLayers: {
      camera: {
        still:
          "The third-person camera stays at a fixed position two metres behind the blogger at shoulder height. Live look input may pan or tilt gently without translating the camera, changing the horizon, or altering character scale.",
        moving:
          "The third-person camera follows smoothly two metres behind the same blogger at shoulder height in one stabilized game-camera shot, matching her heading without orbiting, cutting, or changing her scale abruptly.",
      },
      movement: {
        still:
          "The blogger holds a calm ready stance; her breathing and the smallest leaves move subtly while her feet, the hedges, terraces, and path remain anchored.",
        moving:
          "The blogger moves naturally in the exact direction of player input at a steady walking pace. Her steps remain grounded on the path, nearby hedges pass with coherent parallax, and the architecture never slides or follows her.",
      },
    },
    ensemble: {
      count: 5,
      wander:
        "The five supporting models remain in their five assigned midground side zones. Only one or two at a time take bounded, non-crossing micro-walks or weight shifts; all stay clear of the blogger and central lane.",
      assemble:
        "For this chunk only, the same five models take one short, direct, non-crossing approach from their five side zones to five fixed formation marks, form one sculptural V facing camera, then stop.",
      pose:
        "The same five models occupy the five fixed formation marks in one sculptural V facing camera, feet planted and poses fixed. Only breathing and fabric micro-motion continue; nobody walks or changes pose.",
      release:
        "For this chunk only, the same five models take one short, direct, non-crossing return from the formation marks to their original five side zones, then stop.",
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
            "During this one forward approach, the garden ahead transitions once into a neon mirror conservatory. Violet and magenta light resolves between the existing terraces, flush mirror panels come into view within both hedge walls, and one warm yellow light ring becomes visible over the open path. The greenery, white concrete, protagonist, and path geometry remain continuous.",
          settled:
            "The world ahead is a settled neon mirror conservatory derived from the same hedge maze. Fixed violet and magenta light columns stand between the existing terraces, thin mirror panels sit flush within both hedge walls, and exactly one warm yellow light ring hangs over the open path. The original greenery, white concrete, protagonist, and path geometry remain fixed.",
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
            "During this one forward approach, the existing garden ahead reveals its living couture runway. Geometric seam patterns resolve across both clipped hedge walls and a shallow mirror-water circle comes into view between the fixed terraces. Golden sunlight, rose vines, and fine mist remain continuous around the same blogger and path.",
          settled:
            "The path ahead is a settled living couture runway within the same garden. Two clipped hedge walls remain fixed left and right with precise geometric leaf-seam patterns, and exactly one shallow mirror-water circle rests between the existing terraces. Golden sunlight, rose vines, and fine mist reveal the silver and teal suit.",
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
            "During this one forward approach, the garden ahead transitions once into its golden circuit state. Amber-lit stone steps and two restrained teal-and-gold circuit inlays resolve within the existing hedges and fixed white terraces. Warm light strengthens across the pale path without replacing the greenery, protagonist, or architecture.",
          settled:
            "The world ahead is a settled golden circuit garden within the same architecture. Exactly one wide low staircase of amber-lit stone rests between the existing hedges, and two teal-and-gold circuit inlays remain fixed in the white terrace walls. Warm light reflects across the pale path without replacing the greenery.",
        },
      },
    ],
  },
];

const thirdPersonMovementContract =
  "Live controls move only the blogger and following camera; fixed architecture stays anchored. Preserve one protagonist, stable landmarks, coherent gravity, and one unbroken world.";

export function composeWorldPrompt(
  maze: FashionMaze,
  route?: MazeRoute,
  options: {
    isMoving?: boolean;
    isRouteTransition?: boolean;
    ensembleMode?: EnsemblePromptMode;
  } = {},
): string {
  const isMoving = options.isMoving ?? false;
  const isRouteTransition = options.isRouteTransition ?? false;
  const ensembleMode = options.ensembleMode ?? "wander";
  const destination = route
    ? route.promptDelta[isRouteTransition ? "transition" : "settled"]
    : "At the threshold, one open path continues through the fixed hedge architecture. No world transformation has been applied yet.";

  return [
    maze.basePrompt,
    maze.promptLayers.camera[isMoving ? "moving" : "still"],
    maze.promptLayers.movement[isMoving ? "moving" : "still"],
    destination,
    maze.ensemble[ensembleMode],
    thirdPersonMovementContract,
  ].join(" ");
}

export function findMaze(id: string): FashionMaze {
  return fashionMazes.find((maze) => maze.id === id) ?? fashionMazes[0];
}
