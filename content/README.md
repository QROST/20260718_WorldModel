# Fashion Maze content packet

This folder is a portable snapshot of the team's authoring material from:

`/Users/addincui/Github/2026TheFashionMaze-Hack`

Imported on 2026-07-18 without modifying the source repository.

## Runtime assets

- `public/dataset/hedge-threshold.png` — the 16:9 opening frame and Reactor seed image.
- `public/dataset/fashion-blogger-character-sheet.png` — the three-view concept reference shown in the HTML preview; it is not uploaded to Reactor as a second conditioning image.

## Authoring sources

- `authoring/360-fashion-maze-game-spec.md` — story, maze graph, gameplay ownership, and prompt guidance.
- `authoring/fashion-maze-lingbot-scenes.json` — the 14-scene LingBot prompt registry.

The authoring files are reference sources, not imported wholesale into the client bundle. The current one-world MVP is curated in `lib/fashion-maze.ts` so it never references the many seed filenames that have not yet been delivered.

The source spec recommends first-person for its installation images. The delivered opening frame instead establishes a visible third-person protagonist. The current prompt packet deliberately follows the image and character sheet: it preserves one blogger, one outfit, one trailing camera, and the hedge architecture. Revisit this decision only after a deliberate first-person versus third-person Reactor canary.
