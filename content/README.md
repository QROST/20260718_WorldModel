# Fashion Maze content packet

This folder is a portable snapshot of the team's authoring material from:

`/Users/addincui/Github/2026TheFashionMaze-Hack`

Imported on 2026-07-18 without modifying the source repository.

## Runtime assets

- `public/dataset/hedge-threshold.png` — the original 16:9 opening frame, retained as the composition reference and rollback asset.
- `public/dataset/hedge-threshold-plan-montage-v4.png` — the active Reactor seed, generated from the original frame and the four character sheets on 2026-07-18; it preserves the blogger and adds exactly one relaxed, candid instance each of Ember Court, Forest Tailor, and Silver Architect as the opening ambient blocking. The historical filename remains for provenance; Plan Montage is now continuous prompt behavior, not a UI button.
- `public/dataset/fashion-blogger-character-sheet.png` — the three-view concept reference shown in the HTML preview; it is not uploaded to Reactor as a second conditioning image.
- `public/dataset/models/` — read-only copies of the three supporting-model character sheets supplied in the team repository. They are HTML identity references, not additional Reactor seed images.
- `plan-montage-seed-receipt.md` — identity inputs and the exact final image-refinement prompt for the active seed.

## Authoring sources

- `authoring/360-fashion-maze-game-spec.md` — story, maze graph, gameplay ownership, and prompt guidance.
- `authoring/fashion-maze-lingbot-scenes.json` — the 14-scene LingBot prompt registry.

The authoring files are reference sources, not imported wholesale into the client bundle. The current one-world MVP is curated in `lib/fashion-maze.ts` so it never references the many seed filenames that have not yet been delivered.

The source spec recommends first-person for its installation images. The delivered opening frame instead establishes a visible third-person protagonist. The current prompt packet deliberately follows the image and character sheet: it preserves one blogger, one outfit, one trailing camera, and the hedge architecture. Revisit this decision only after a deliberate first-person versus third-person Reactor canary.
