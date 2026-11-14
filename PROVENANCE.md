# QROST project provenance

`Fashion Maze` is maintained under the public creator identity **QROST**.

- Creator: `QROST`
- Work ID: `qrost.fashion-maze`
- Provenance schema: `qrost.provenance/v1`
- Canonical repository: <https://github.com/QROST/20260718_WorldModel>
- Public creator page: <https://qrost.github.io/>

The repository-wide [`PROVENANCE.json`](./PROVENANCE.json) records the SHA-256
digest, byte length, content class, and provenance policy for every tracked or
new non-ignored release file except the manifest itself. Ignored build output,
local secrets, and operating-system metadata are not release files. Exact copies can therefore be
matched back to a public QROST revision even when a file format cannot safely
carry a comment. Run `pnpm verify:provenance` to verify the current tree and
`pnpm provenance:update` after an intentional file change. The maintainable
source-header policy can be reapplied idempotently to tracked files with
`pnpm authorship:update`; untracked source is checked but never rewritten.

Eligible original source files carry a syntax-safe QROST header. HTML metadata,
HTTP response headers, downloaded filenames, and runtime receipts repeat the
same declaration. The manifest remains the
repository-wide inventory and the canonical constants live in
[`lib/qrost-provenance.ts`](./lib/qrost-provenance.ts).
The HTTP value identifies the containing work and its QROST maintainer; it does
not assert that QROST created every individual asset served by the application.

## Rights and source boundaries

The declaration identifies QROST's authorship of the original application
code, system design, integration work, and project-specific documentation. It
does **not** rewrite the authorship or rights of other material:

- `content/authoring/` is a snapshot of the team's earlier authoring source.
- `public/dataset/` contains team-supplied and generated source imagery. QROST
  is declaring repository curation, conversion, and publication provenance,
  not claiming to be the original image generator or sole rights holder.
- Third-party packages retain their own licenses and notices.
- `submission/oneshot/` is a separately verified submission artifact whose
  prompt and dry-run hashes are pinned against accidental change.

Original application code, system design, integration work, and
project-specific documentation by QROST are released under the Apache License,
Version 2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE). That grant
does not cover `content/authoring/`, `public/dataset/`, AninaNet's creative
concept and storyline, third-party packages, or `submission/oneshot/`.

## Evidence strength

The manifest and embedded declarations are transparent attribution evidence,
not an unforgeable signature. Strong release evidence should also include a
publicly timestamped commit and, when a signing identity is configured, a
cryptographically signed release tag. Never derive provenance from API keys,
JWTs, session IDs, user choices, hidden pixels, prompt wording, or control
timing.
