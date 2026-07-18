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
  promptDelta: string;
}

export interface PromptMotionLayer {
  still: string;
  moving: string;
}

export interface FashionMazePromptLayers {
  camera: PromptMotionLayer;
  movement: PromptMotionLayer;
}

export interface FashionMaze {
  id: string;
  edition: string;
  title: string;
  subtitle: string;
  location: string;
  seedImage: string;
  seed: number;
  accent: string;
  entrance: NarrativeBeat;
  basePrompt: string;
  promptLayers: FashionMazePromptLayers;
  routes: MazeRoute[];
}

/**
 * Prototype content only. Replace these records with the team's image dataset
 * and authored narrative later; the UI and Reactor controller consume this
 * shape without any model-specific knowledge.
 */
export const fashionMazes: FashionMaze[] = [
  {
    id: "afterglow-archive",
    edition: "MAZE 01",
    title: "Afterglow Archive",
    subtitle: "Every garment remembers a body.",
    location: "Memory / Night / Synthetic silk",
    seedImage: "/maze/afterglow-archive.svg",
    seed: 31415,
    accent: "#ff4fc8",
    entrance: {
      eyebrow: "THE THRESHOLD",
      title: "The archive is awake.",
      body: "A corridor of unworn memories waits for a witness. Which part of a garment should survive: its silhouette, its material, or the person who changed it?",
    },
    basePrompt:
      "A cinematic first-person fashion labyrinth inside a vast black archive. Monumental translucent magenta fabric arches form a navigable corridor. Tall faceless couture mannequins stand in fixed illuminated alcoves on both sides. Their garments combine liquid satin, sculptural pleats, and fiber-optic seams. The polished obsidian floor reflects the installations. High-fashion editorial lighting, deep blacks, vivid fuchsia and violet accents, physically coherent perspective, rich textile detail. The same corridor, arches, and mannequin positions remain spatially stable. No typography, no logos, no cuts, no montage.",
    promptLayers: {
      camera: {
        still:
          "The first-person camera is still at human eye level, centered in a composed wide editorial frame with a clear view down the corridor.",
        moving:
          "The first-person camera becomes a smooth stabilized tracking shot at human eye level, preserving the corridor's orientation and continuous spatial identity.",
      },
      movement: {
        still:
          "The mannequins and architecture hold their positions; only restrained fabric shimmer and atmospheric light move gently.",
        moving:
          "As the viewer travels, nearby fabric edges respond with subtle parallax and airflow while every installation remains anchored in place.",
      },
    },
    routes: [
      {
        id: "silhouette",
        direction: "LEFT",
        navigation: "left",
        title: "Follow the silhouette",
        teaser: "Shape becomes memory.",
        accent: "#ff4fc8",
        narrative: {
          eyebrow: "PATH OF FORM",
          title: "A body can leave without disappearing.",
          body: "The archive keeps only outlines. Sleeves, shoulders, and hems become an alphabet written by people who are no longer here.",
        },
        promptDelta:
          "The left passage is a settled gallery of enormous suspended silhouettes. Black and fuchsia couture outlines float like architectural shadows, each one sharply distinct. The mannequins and archive remain fixed while the path opens clearly to the left.",
      },
      {
        id: "fiber",
        direction: "FORWARD",
        navigation: "forward",
        title: "Trace the fiber",
        teaser: "Material tells the truth.",
        accent: "#b38cff",
        narrative: {
          eyebrow: "PATH OF MATTER",
          title: "Touch is a kind of evidence.",
          body: "Labels vanish. Brands dissolve. What remains is the intimacy of fiber: stretched, repaired, stained, and made luminous by use.",
        },
        promptDelta:
          "The forward corridor is a stable material observatory. Vast woven membranes, magnified threads, hand repairs, and luminous seams form layered textile walls. Violet light reveals every fiber while the central walking line remains open and spatially coherent.",
      },
      {
        id: "ghost",
        direction: "RIGHT",
        navigation: "right",
        title: "Meet the ghost",
        teaser: "Identity refuses the display case.",
        accent: "#ff8a6b",
        narrative: {
          eyebrow: "PATH OF PRESENCE",
          title: "The wearer steps back into the frame.",
          body: "The collection stops pretending it was made by objects alone. Invisible lives return as gestures, warmth, and traces of movement.",
        },
        promptDelta:
          "The right passage is a settled hall of human presence. Soft amber volumetric figures appear beside the fixed mannequins as elegant traces of past wearers, diverse in height and posture. They are calm luminous impressions, not horror ghosts. The path turns clearly right.",
      },
    ],
  },
  {
    id: "living-atelier",
    edition: "MAZE 02",
    title: "Living Atelier",
    subtitle: "The collection is still growing.",
    location: "Symbiosis / Dawn / Bio-material",
    seedImage: "/maze/living-atelier.svg",
    seed: 27182,
    accent: "#b6ff70",
    entrance: {
      eyebrow: "THE GREEN ROOM",
      title: "Nothing here is finished.",
      body: "The atelier treats clothes as temporary agreements between bodies and ecosystems. Choose what the collection learns to become.",
    },
    basePrompt:
      "A dreamlike first-person fashion maze inside a luminous botanical atelier at dawn. Cream stone pathways curve between tall translucent greenhouse ribs. Sculptural couture mannequins wear garments grown from mycelium lace, algae silk, seed pods, and delicate leaf structures. Pale mist, dew, warm sunlight, celadon and acid-green accents. Luxurious editorial fashion photography, tactile organic materials, coherent walkable depth. The greenhouse ribs, pathways, and mannequin installations remain spatially stable. No typography, no logos, no cuts, no montage.",
    promptLayers: {
      camera: {
        still:
          "The first-person camera rests at human eye level in a calm symmetrical editorial composition, looking along the open greenhouse path.",
        moving:
          "The first-person camera glides at walking pace in one stabilized continuous shot, keeping the greenhouse geometry and path direction coherent.",
      },
      movement: {
        still:
          "The couture displays remain rooted and composed while dew, mist, and the smallest leaves move almost imperceptibly.",
        moving:
          "Movement creates gentle plant and textile parallax with a light response to passing air; the path and displays never drift or relocate.",
      },
    },
    routes: [
      {
        id: "symbiosis",
        direction: "LEFT",
        navigation: "left",
        title: "Dress with the habitat",
        teaser: "Garment and garden negotiate.",
        accent: "#b6ff70",
        narrative: {
          eyebrow: "PATH OF SYMBIOSIS",
          title: "The garment begins to listen.",
          body: "Color responds to humidity. Openings follow sunlight. Fashion becomes less an object than a relationship with a place.",
        },
        promptDelta:
          "The left path is a stable symbiotic couture garden. Garments integrate living moss panels, responsive leaf vents, and translucent algae-silk layers. The installations remain elegant and wearable, rooted beside the fixed path without overgrowing it.",
      },
      {
        id: "bloom",
        direction: "FORWARD",
        navigation: "forward",
        title: "Enter the bloom",
        teaser: "Abundance replaces permanence.",
        accent: "#ffe66d",
        narrative: {
          eyebrow: "PATH OF ABUNDANCE",
          title: "A collection can have a season.",
          body: "These pieces are designed to flower, release their color, and return. Their value lives in timing rather than permanence.",
        },
        promptDelta:
          "The forward path is a settled seasonal runway of oversized pale-yellow blooms and refined petal garments. Floral structures frame the corridor without blocking it. Warm sunlight catches pollen-like gold particles suspended gently in the air.",
      },
      {
        id: "compost",
        direction: "RIGHT",
        navigation: "right",
        title: "Design the ending",
        teaser: "Decay becomes authorship.",
        accent: "#72d6a0",
        narrative: {
          eyebrow: "PATH OF RETURN",
          title: "The last look is not the last state.",
          body: "Fastening, dye, and seam are reconsidered from the end backward. The exit is designed with as much care as the entrance.",
        },
        promptDelta:
          "The right passage is a calm material-return chamber. Deconstructed couture layers rest in precise circular beds of fiber, mineral pigment, and mycelium, showing an elegant cycle of disassembly and renewal. The path stays clear and turns right.",
      },
    ],
  },
  {
    id: "mirror-protocol",
    edition: "MAZE 03",
    title: "Mirror Protocol",
    subtitle: "How many selves can one look hold?",
    location: "Identity / Blue hour / Digital chrome",
    seedImage: "/maze/mirror-protocol.svg",
    seed: 16180,
    accent: "#77d9ff",
    entrance: {
      eyebrow: "THE FITTING ROOM",
      title: "Your reflection has options.",
      body: "The mirror no longer asks whether a look is real. It asks which version of you gets to continue through the maze.",
    },
    basePrompt:
      "A surreal first-person fashion maze made from mirrored chrome corridors at blue hour. Elegant faceless avatars in futuristic couture occupy fixed display platforms. Their garments combine reflective metal mesh, translucent blue organza, and precise geometric tailoring. Infinite reflections feel architectural rather than chaotic. Cool cyan light, deep cobalt shadows, high-fashion campaign photography, crisp material detail, coherent navigable perspective. The mirror walls, platforms, and avatars remain spatially stable. No typography, no logos, no cuts, no montage.",
    promptLayers: {
      camera: {
        still:
          "The first-person camera is still at human eye level in a precise centered fashion-campaign frame, with ordered reflections and a legible route ahead.",
        moving:
          "The first-person camera moves as a stabilized continuous tracking shot, maintaining a consistent horizon and intelligible mirrored architecture.",
      },
      movement: {
        still:
          "Avatars and platforms hold perfectly still while controlled blue light travels softly across chrome and organza surfaces.",
        moving:
          "As the viewer moves, reflections and translucent layers shift through natural parallax while the real avatars, platforms, and walls stay fixed.",
      },
    },
    routes: [
      {
        id: "duplicate",
        direction: "LEFT",
        navigation: "left",
        title: "Multiply the look",
        teaser: "One identity becomes a chorus.",
        accent: "#77d9ff",
        narrative: {
          eyebrow: "PATH OF COPIES",
          title: "Repetition reveals the difference.",
          body: "Each copy keeps the same silhouette but changes one decision. Identity emerges not from consistency, but from variation.",
        },
        promptDelta:
          "The left corridor is a stable procession of repeated couture avatars. Each shares one precise silhouette while material, color, and gesture vary subtly from platform to platform. Cyan reflections remain ordered and the path opens left.",
      },
      {
        id: "distort",
        direction: "FORWARD",
        navigation: "forward",
        title: "Distort the mirror",
        teaser: "The error becomes the signature.",
        accent: "#9b8cff",
        narrative: {
          eyebrow: "PATH OF GLITCH",
          title: "Perfection was only one protocol.",
          body: "The mirror bends proportion and symmetry without turning the body into a joke. Distortion becomes a deliberate new grammar.",
        },
        promptDelta:
          "The forward corridor is a controlled optical salon. Curved mirror panels elongate and compress reflections while the real avatars and tailored garments remain elegant, intact, and fixed. Violet-blue light makes each distortion deliberate and graphic.",
      },
      {
        id: "dissolve",
        direction: "RIGHT",
        navigation: "right",
        title: "Leave the image",
        teaser: "Presence without a profile.",
        accent: "#f3f7ff",
        narrative: {
          eyebrow: "PATH OF ABSENCE",
          title: "You do not owe the mirror a face.",
          body: "Recognition fades. Texture, motion, and space take over. The look becomes an atmosphere that cannot be reduced to a profile.",
        },
        promptDelta:
          "The right path is a serene identity-free chamber. Couture remains as floating layers of translucent organza, chrome mesh, and moving light without visible faces or bodies. The architectural mirror maze stays coherent and the exit turns right.",
      },
    ],
  },
];

const movementContract =
  "A first-person camera may move smoothly forward, backward, or sideways through the open walkway and may look around gently. Camera motion never moves the fixed installations. Maintain continuous spatial identity and a single unbroken shot.";

export function composeWorldPrompt(
  maze: FashionMaze,
  route?: MazeRoute,
  options: { isMoving?: boolean } = {},
): string {
  const isMoving = options.isMoving ?? false;
  const destination = route
    ? route.promptDelta
    : "At the threshold, three clearly readable passages lead left, forward, and right. The camera is still, centered, and ready to choose a direction.";

  return [
    maze.basePrompt,
    maze.promptLayers.camera[isMoving ? "moving" : "still"],
    maze.promptLayers.movement[isMoving ? "moving" : "still"],
    destination,
    movementContract,
  ].join(" ");
}

export function findMaze(id: string): FashionMaze {
  return fashionMazes.find((maze) => maze.id === id) ?? fashionMazes[0];
}
