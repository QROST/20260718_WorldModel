# FORK THE BLOCK — One Shot Challenge package

Submission title: **FORK THE BLOCK**

Tagline: **DON’T PICK A FUTURE. STEER IT.**

For **GPT-5.6 Terra**, use [`fork-the-block.terra.prompt.txt`](./fork-the-block.terra.prompt.txt). It asks the model for an authored inline-SVG city with a deliberately tiny JavaScript state machine. The player holds and blends `COOL`, `MOVE`, and `GATHER`; changes remain in one city and preset combination layers upgrade existing places.

Terra prompt size: **7,552 / 10,000 characters**. SHA-256: `29c2b5f934749ee789fb63cef6c32753b85869e34351fa2a9fca6cc7962e9a78`.

The earlier [`fork-the-block.prompt.txt`](./fork-the-block.prompt.txt) remains preserved as the **Canvas/high-capability baseline**: 9,172 characters, SHA-256 `3ff0b35e9af9482285f18f20bef5e1efe5b3b95746aa28fa6031785a2bc18cc2`.

## Why this architecture

The challenge publishes the model's first output without repair. A target-matched Terra simulation showed that the Canvas version spent most of its budget on projection, drawing helpers, path motion, seeded generation, and input machinery. The Terra prompt moves visual complexity into fixed SVG markup and limits JavaScript to three persistent numbers, held-source Sets, threshold reveals, and Reset. The neutral city is complete before JavaScript, so a script failure cannot create a blank first frame.

This package is separate from the repository's Reactor/ABot prototype. The challenge sandbox cannot run that server-backed app, and `reactor.key` is neither read nor used here.

## Verify

```bash
node submission/oneshot/verify.mjs
```

Verify the current Terra prompt and its untouched exact-prompt simulation:

```bash
node submission/oneshot/verify-terra.mjs
```

Verify the preserved Canvas baseline dry run:

```bash
node submission/oneshot/verify.mjs submission/oneshot/dry-run-v2.html
```

Terra evidence is recorded in [`TERRA_QA_RECEIPT.md`](./TERRA_QA_RECEIPT.md). The Canvas browser evidence remains in [`QA_RECEIPT.md`](./QA_RECEIPT.md).

## Live submission facts checked on July 18, 2026

- Prompt field limit: 10,000 characters.
- Exactly one provider call; no retries or edits.
- Result must be one self-contained HTML file with inline CSS and JavaScript.
- The prompt and selected model remain sealed until results, then become public.
- A submission needs email confirmation and a supported provider API key.

Authoritative pages: [submission form](https://oneshotchallenge.ai/submit), [architecture and system prompt](https://oneshotchallenge.ai/architecture), [asset rules](https://oneshotchallenge.ai/assets).

## External action boundary

Entering an email or provider key and clicking **Submit** transmits data and consumes the day's one shot. Keep the final browser action for explicit user confirmation. Prefer a fresh, spend-limited provider key and revoke it after the run.
