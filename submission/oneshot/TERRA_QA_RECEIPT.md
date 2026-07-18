# FORK THE BLOCK — GPT-5.6 Terra QA receipt

Date: 2026-07-18

## Recommended prompt

- File: `fork-the-block.terra.prompt.txt`
- Target: `gpt-5.6-terra`
- Length: **7,552 / 10,000 characters**
- Remaining form budget: **2,448 characters**
- SHA-256: `29c2b5f934749ee789fb63cef6c32753b85869e34351fa2a9fca6cc7962e9a78`

The Terra version replaces the procedural Canvas city engine with one authored inline SVG and a small state machine. It removes the editable seed, New Block, PRNG, path engine, dynamic depth sort, agent simulation, Canvas/DPR machinery, and optional latch tiers. It retains persistent `COOL`, `MOVE`, and `GATHER` memory, all three pairwise combinations, the central `LIVING BLOCK` culmination, Reset, simultaneous pointer/keyboard holds, cancellation cleanup, accessibility, and responsive layout.

## Model-matched one-shot iterations

Each artifact below was written exactly once by a fresh `gpt-5.6-terra` agent at medium reasoning. The agents were instructed not to inspect, run, repair, or rewrite their output. No generated HTML was edited afterward.

| Run | Artifact | Bytes | SHA-256 | Prompt-only learning |
| --- | --- | ---: | --- | --- |
| 1 | `dry-run-terra.html` | 17,916 | `121c3665bb63f7c017e398020f1453e4d88f29337169b5e63e088108f1a3927e` | Complete and parseable, but asphalt consumed most of the slab and combination visibility was not threshold-gated. |
| 2 | `dry-run-terra-v2.html` | 17,917 | `d45af881f447fa53da3b314e83e9dceae70bfbee5c8d3418452d5a64afe71401` | Restored cream ground and gated combinations, but base city changes stayed hidden until their latch thresholds. |
| 3 | `dry-run-terra-v3.html` | 20,440 | `ff5b514ef6b73be3ac908f384f2121281365aae052ca5ead23d2ae49b86acb6a` | Exact current prompt: two explicit streets, four raised parcel groups, immediate persistent base changes, gated pair layers, and the central culmination. |

Only the prompt changed between runs. Run 3 is the preserved model-matched baseline for the recommended prompt.

## Reproducible static gate

Run:

```bash
node submission/oneshot/verify-terra.mjs
```

Run 3 passes all enforced checks:

- one complete HTML document with one inline SVG and one parseable inline script;
- zero remote URLs, module imports, network primitives, Canvas elements, or unfinished markers;
- 4 real buttons, 36 SVG groups, 83 paths, and 28 reusable `<use>` instances;
- all required neutral, parcel, intention, pairwise, highlight, and `LIVING BLOCK` layers;
- immediate `0.12` persistent memory, pair threshold `0.55`, all-three threshold `0.62`;
- multi-source Sets plus pointer cancellation, lost capture, blur, and visibility cleanup.

## Honest residuals

- This is a target-model simulation under the Codex agent harness, not the challenge server's exact provider request, so a live entry can vary.
- The model still emitted multiplication inside decorative CSS `calc()` expressions despite the prompt forbidding it. Browsers that reject those expressions can lose some transform/dash flourish; the core opacity-driven memory, threshold visibility, controls, and Reset do not depend on them.
- Static/source QA passed. A fresh visual browser run was not performed because this environment blocked local `file://` page capture; no workaround was used.
- The output is intentionally preserved, not repaired. Any remaining visual weakness is evidence about Terra and the prompt, not hidden post-processing.
