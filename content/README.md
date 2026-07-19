# Fashion Maze content packet

This folder is a portable snapshot of the team's original Fashion Maze
authoring repository.

Imported on 2026-07-18 without modifying the source repository.

## Runtime assets

- `public/dataset/rose-garden/` — three Chapter 01 seeds.
- `public/dataset/cyberpunk-garden/` — three independently selectable Chapter 02 seeds.
- `public/dataset/asian-sculpture-garden/grand-finale.webp` — the Chapter 03 seed.
- `public/dataset/afro-futurism/` — three Chapter 04 seeds with 5 / 7 / 5 seed-visible performers. The selected variant overrides `ensemble.count` so the shared photo choreography addresses the correct cast.
- `public/dataset/scenes/chapter-05/` — three independently replaceable Chapter 05 seeds, currently copied from the Afro-futurism set, with 5 / 7 / 5 performers.
- `public/dataset/scenes/chapter-06/` — six Chapter 06 silver-garden seeds with 6 / 6 / 5 / 6 / 6 / 6 performers.
- `public/dataset/scenes/chapter-07/` — five Chapter 07 copper-ring seeds with 6 / 6 / 5 / 5 / 6 performers.

The older hedge-threshold, blogger, and character-sheet files remain as provenance and rollback references. They are not active seed images in the current seven-chapter runtime.

## Authoring sources

- `authoring/360-fashion-maze-game-spec.md` — story, maze graph, gameplay ownership, and prompt guidance.
- `authoring/fashion-maze-lingbot-scenes.json` — the 14-scene LingBot prompt registry.

The authoring files are reference sources, not imported wholesale into the client bundle. The current seven-chapter first-person observer experience is curated in `lib/fashion-maze.ts`; Chapters 05–07 share one seed-led Prompt factory so their images can be replaced without rewriting scene prose.
