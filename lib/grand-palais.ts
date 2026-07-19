import type { FashionMaze } from "./fashion-maze";

export const GRAND_PALAIS_SCENE_ID = "grand-palais";
export const GRAND_PALAIS_IMAGE_MODEL = "gpt-image-2";

export interface GrandPalaisReferenceSelection {
  sceneId: string;
  entranceVariantId: string;
}

export interface GrandPalaisGenerationRequest {
  scenes: GrandPalaisReferenceSelection[];
}

export const GRAND_PALAIS_IMAGE_PROMPT =
  "Create one completely new photorealistic 16:9 fashion editorial scene centered on ‘grand palais fashion show’. Treat all seven reference images as equal material from one guest’s journey. Invent a future Grand Palais runway that nobody has seen before. Remix environments, materials, colors, architecture, gardens, portals, sculptures, neon prisms, copper forms, models and couture looks from the references into one coherent venue and moment. Earlier environments and performers may reappear in new combinations. Do not create a collage, contact sheet, split screen, mood board, or copy any reference scene exactly. Show a wide first-person arrival view with a clear walkable foreground, runway, audience and monumental architecture, coherent full-depth geometry, cinematic event lighting, no captions, logos, frames or watermark. Make this interpretation original and different on every generation.";

// Paraphrased from MD/360-fashion-maze-game-spec.md, especially lines 8–10
// and 253–266: invitation, late arrival, changing installations and finale.
export const GRAND_PALAIS_STORY_LINES = [
  "A fashion PR handed you an envelope.",
  "Inside: an invitation to the season’s grand finale.",
  "The address led to a maze, not a venue.",
  "You arrived late. The gate had already begun to close.",
  "Each world became a living fashion installation.",
  "You photographed the looks while the path changed around you.",
  "You made it through before the gate sealed.",
  "Every world you crossed is becoming part of one final runway.",
  "The Grand Palais is taking shape beyond the dark.",
  "A front-row seat is waiting on the other side.",
] as const;

/** Create the runtime-only Scene 8 after its OpenAI image has been generated. */
export function createGrandPalaisMaze(
  seedImage: string,
  seed: number,
): FashionMaze {
  return {
    id: GRAND_PALAIS_SCENE_ID,
    entrySelectable: false,
    edition: "CHAPTER 08",
    title: "The Grand Palais",
    subtitle: "Every world returns as one impossible runway.",
    location: "Grand Palais / Generated finale / Front-row arrival",
    seedImage,
    seed,
    openingPrompt:
      "The generated image is the exact Scene 8 spatial anchor. Preserve every seed-visible person, couture look, audience bank, runway edge, architectural span, light source, reflection and depth relationship at its seed-space root.",
    entranceVariants: [
      {
        id: "generated-grand-palais",
        label: "This Run’s Grand Palais",
        seedImage,
        seed,
        openingPrompt:
          "The generated image is the exact Scene 8 spatial anchor. Preserve every seed-visible person, couture look, audience bank, runway edge, architectural span, light source, reflection and depth relationship at its seed-space root.",
        ensembleCount: "all",
      },
    ],
    entranceVariantId: "generated-grand-palais",
    accent: "#d8b66c",
    entrance: {
      eyebrow: "YOU ARE ON TIME",
      title: "Your front-row place was waiting.",
      body:
        "The seven worlds have recomposed themselves beneath the Grand Palais roof. The show begins from a view that exists only for this run.",
    },
    basePrompt:
      "The generated seed is an authoritative Grand Palais fashion show with one primary runway model, seed-visible couture guests and audience, a clear runway, monumental architecture and cinematic event light. Preserve every visible identity, garment, structure, prop, surface, reflection and spatial relationship. Photorealistic luxury fashion editorial.",
    defaultDestinationPrompt:
      "The generated Grand Palais runway, audience, architecture and lighting remain the settled finale world at their seed positions.",
    promptLayers: {
      movement:
        "The primary runway model continues a poised slow presentation while the seed-visible audience remains seated and attentive. Rare blinks, faint breathing, restrained fabric motion and subtle event-light movement keep the show alive without changing identities, positions or architecture.",
    },
    ensemble: { count: "all" },
    routes: [],
  };
}
