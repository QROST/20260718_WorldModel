// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

export const QROST_PROVENANCE = Object.freeze({
  schema: "qrost.provenance/v1",
  creator: "QROST",
  workId: "qrost.fashion-maze",
  workVersion: "0.1.0",
  claim: "declared-project-authorship-and-repository-curation",
  canonicalRepository: "https://github.com/QROST/20260718_WorldModel",
  creatorUrl: "https://qrost.github.io/",
} as const);

export const QROST_PROVENANCE_HEADER = "X-QROST-Provenance";
export const QROST_PROVENANCE_VALUE =
  `work=${QROST_PROVENANCE.workId};v=1;maintainer=${QROST_PROVENANCE.creator}`;
export const QROST_OUTPUT_PREFIX = "qrost-fashion-maze";

export interface QrostRunReceiptInput {
  sceneOrderSeed: number | null;
  sceneOrderIds: readonly string[];
  entranceVariantIds: readonly string[];
  promptFingerprint?: string | null;
}

export interface QrostRunReceipt {
  schema: typeof QROST_PROVENANCE.schema;
  creator: typeof QROST_PROVENANCE.creator;
  workId: typeof QROST_PROVENANCE.workId;
  sceneOrderSeed: number | null;
  sceneOrderIds: readonly string[];
  entranceVariantIds: readonly string[];
  promptFingerprint: string | null;
}

export function createQrostRunReceipt(
  input: QrostRunReceiptInput,
): Readonly<QrostRunReceipt> {
  if (
    input.sceneOrderSeed !== null &&
    (!Number.isSafeInteger(input.sceneOrderSeed) || input.sceneOrderSeed < 0)
  ) {
    throw new Error("A QROST run receipt seed must be null or a non-negative integer.");
  }

  return Object.freeze({
    schema: QROST_PROVENANCE.schema,
    creator: QROST_PROVENANCE.creator,
    workId: QROST_PROVENANCE.workId,
    sceneOrderSeed: input.sceneOrderSeed,
    sceneOrderIds: Object.freeze([...input.sceneOrderIds]),
    entranceVariantIds: Object.freeze([...input.entranceVariantIds]),
    promptFingerprint: input.promptFingerprint ?? null,
  });
}

export function serializeQrostRunReceipt(receipt: QrostRunReceipt): string {
  return JSON.stringify(receipt);
}
