# QROST project provenance

`Fashion Maze` is maintained under the public creator identity **QROST**.

- Creator: `QROST`
- Work ID: `qrost.fashion-maze`
- Provenance schema: `qrost.provenance/v1`
- Canonical repository: <https://github.com/QROST/20260718_WorldModel>
- Public creator page: <https://qrost.github.io/>

The repository-wide [`PROVENANCE.json`](./PROVENANCE.json) records the SHA-256
digest, byte length, content class, and provenance policy for every tracked or
new, non-ignored file except the manifest itself. Exact copies can therefore be
matched back to a public QROST revision even when a file format cannot safely
carry a comment. Run `pnpm verify:provenance` to verify the current tree and
`pnpm provenance:update` after an intentional file change.

Source headers, HTML metadata, HTTP response headers, downloaded filenames,
and runtime receipts may repeat the same declaration. The manifest remains the
repository-wide inventory and the canonical constants live in
[`lib/qrost-provenance.ts`](./lib/qrost-provenance.ts).

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
  prompt and dry-run hashes must remain unchanged.

This provenance notice is not an open-source license and does not choose one on
the owner's behalf. Public visibility, attribution, and permission to reuse are
separate questions. Add a deliberate `LICENSE` only after the intended reuse
terms have been selected.

## Evidence strength

The manifest and embedded declarations are transparent attribution evidence,
not an unforgeable signature. Strong release evidence should also include a
publicly timestamped commit and, when a signing identity is configured, a
cryptographically signed release tag. Never derive provenance from API keys,
JWTs, session IDs, user choices, hidden pixels, prompt wording, or control
timing.
