import {
  FASHION_MAZE_PROMPT_BUDGET,
  type FashionMazePromptSegment,
  type FashionMazePromptSegmentKind,
} from "./fashion-maze";

export interface FashionMazePromptPolicyViolation {
  code: "missing-budget" | "over-budget" | "missing-policy" | "layer-ownership";
  segment: FashionMazePromptSegment;
  message: string;
}

interface OwnershipRule {
  pattern: RegExp;
  message: string;
}

const processVerbPattern =
  /\b(appears?|grows?|changes?|resolves?|transforms?|becomes?|emerges?)\b/i;
const cameraLanguagePattern =
  /\b(first-person|camera|lens|observer|viewpoint|input|pan|zoom|dolly)\b/i;
const behaviorLanguagePattern = /\b(blink|breath|gesture|pose|hold)\b/i;

const ownershipRules = {
  base: [
    {
      pattern: new RegExp(
        cameraLanguagePattern.source + "|" + behaviorLanguagePattern.source,
        "i",
      ),
      message: "contains camera, input, or behavior language",
    },
  ],
  anchor: [
    {
      pattern: cameraLanguagePattern,
      message: "contains camera or input language",
    },
    {
      pattern: /\b(blink|breath|gesture)\b/i,
      message: "contains ambient behavior language",
    },
    {
      pattern: processVerbPattern,
      message: "contains a generation process verb",
    },
  ],
  camera: [
    {
      pattern: /\b[MCSA]\d{2}\b|\b(blink|breath|gesture|pose|couture)\b/i,
      message: "contains cast identity or choreography",
    },
  ],
  movement: [
    {
      pattern: cameraLanguagePattern,
      message: "contains camera or input language",
    },
  ],
  destination: [
    {
      pattern: cameraLanguagePattern,
      message: "contains camera or input language",
    },
    {
      pattern: behaviorLanguagePattern,
      message: "contains subject choreography",
    },
    {
      pattern: processVerbPattern,
      message: "contains a generation process verb",
    },
  ],
  event: [],
  continuity: [
    {
      pattern:
        /\b[MCSA]\d{2}\b|\b(seed|camera|observer|viewpoint|input|pose|gesture|door|portal|route)\b/i,
      message: "contains scene, camera, cast, or event-specific language",
    },
  ],
} satisfies Record<
  FashionMazePromptSegmentKind,
  readonly OwnershipRule[]
>;

const intentQualifierPattern = /\b(try to|please|make sure|attempt to)\b/i;

export function findPromptLayerBudgetViolations(
  segments: readonly FashionMazePromptSegment[],
): FashionMazePromptPolicyViolation[] {
  const limits = FASHION_MAZE_PROMPT_BUDGET as Record<string, unknown>;
  const violations: FashionMazePromptPolicyViolation[] = [];
  for (const segment of segments) {
    const limit = limits[segment.kind];
    if (!Number.isInteger(limit)) {
      violations.push({
        code: "missing-budget",
        segment,
        message: segment.kind + " has no finite integer layer budget",
      });
      continue;
    }
    if (segment.text.length > (limit as number)) {
      violations.push({
        code: "over-budget",
        segment,
        message:
          segment.label +
          " is " +
          segment.text.length +
          " chars; layer limit is " +
          String(limit),
      });
    }
  }
  return violations;
}

export function findPromptLayerOwnershipViolations(
  segments: readonly FashionMazePromptSegment[],
): FashionMazePromptPolicyViolation[] {
  const policies = ownershipRules as Record<string, readonly OwnershipRule[]>;
  const violations: FashionMazePromptPolicyViolation[] = [];
  for (const segment of segments) {
    const rules = policies[segment.kind];
    if (!rules) {
      violations.push({
        code: "missing-policy",
        segment,
        message: segment.kind + " has no layer ownership policy",
      });
      continue;
    }
    for (const rule of rules) {
      if (rule.pattern.test(segment.text)) {
        violations.push({
          code: "layer-ownership",
          segment,
          message: segment.label + " " + rule.message,
        });
      }
    }
    if (intentQualifierPattern.test(segment.text)) {
      violations.push({
        code: "layer-ownership",
        segment,
        message: segment.label + " contains an intent qualifier",
      });
    }
  }
  return violations;
}
