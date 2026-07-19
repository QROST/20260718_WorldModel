import {
  assertFashionMazeSceneOrder,
  findMaze,
  resolveMazeEntrance,
} from "./fashion-maze";
import type {
  GrandPalaisGenerationRequest,
  GrandPalaisReferenceSelection,
} from "./grand-palais";

export interface ResolvedGrandPalaisReference
  extends GrandPalaisReferenceSelection {
  seedImage: string;
}

function isReferenceSelection(
  value: unknown,
): value is GrandPalaisReferenceSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    "sceneId" in value &&
    typeof value.sceneId === "string" &&
    "entranceVariantId" in value &&
    typeof value.entranceVariantId === "string"
  );
}

/** Resolve browser selections through the registered allowlist, never a path. */
export function resolveGrandPalaisReferences(
  value: unknown,
): ResolvedGrandPalaisReference[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("scenes" in value) ||
    !Array.isArray(value.scenes) ||
    !value.scenes.every(isReferenceSelection)
  ) {
    throw new Error("Invalid finale reference selection.");
  }

  const request: GrandPalaisGenerationRequest = {
    scenes: value.scenes.map((selection) => ({
      sceneId: selection.sceneId,
      entranceVariantId: selection.entranceVariantId,
    })),
  };
  assertFashionMazeSceneOrder(
    request.scenes.map((selection) => selection.sceneId),
  );

  return request.scenes.map((selection) => {
    const maze = findMaze(selection.sceneId);
    const resolvedMaze = resolveMazeEntrance(
      maze,
      selection.entranceVariantId,
    );
    return { ...selection, seedImage: resolvedMaze.seedImage };
  });
}
