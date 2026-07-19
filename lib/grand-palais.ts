// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import {
  SEED_WORLD_ANCHOR_PROMPT,
  SEED_WORLD_BASE_PROMPT,
  SEED_WORLD_DESTINATION_PROMPT,
  SEED_WORLD_MOVEMENT_PROMPT,
  type FashionMaze,
} from "./fashion-maze";

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
  "Create a new photorealistic 16:9 grand palais fashion show. Treat all seven reference images as equal source material from the journey. Recombine their architecture, gardens, portals, sculptures, materials, colors and couture into one original coherent venue. Do not make a collage, contact sheet, split screen, mood board or copy of any reference. Show a wide first-person arrival with a clear foreground, runway, audience, monumental architecture and cinematic event light. No text, logos, frames or watermark. Vary the result each run.";

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
    openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
    entranceVariants: [
      {
        id: "generated-grand-palais",
        label: "This Run’s Grand Palais",
        seedImage,
        seed,
        openingPrompt: SEED_WORLD_ANCHOR_PROMPT,
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
    basePrompt: SEED_WORLD_BASE_PROMPT,
    defaultDestinationPrompt: SEED_WORLD_DESTINATION_PROMPT,
    promptLayers: {
      movement:
        "Continue the seed-visible runway presentation slowly. Keep the audience settled; allow only rare blinks, faint breathing, fabric settling and event-light variation.",
    },
    ensemble: { count: "all" },
    routes: [],
  };
}
