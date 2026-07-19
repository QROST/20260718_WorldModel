import { FashionMazeExperience } from "@/components/FashionMazeExperience";
import { fashionMazes } from "@/lib/fashion-maze";
import { hasReactorApiKey } from "@/lib/reactor-server";

export const dynamic = "force-dynamic";

export default function Page() {
  const initialEntranceVariantIds = Object.fromEntries(
    fashionMazes.map((maze) => {
      const entrances = maze.entranceVariants;
      const entrance =
        entrances[Math.floor(Math.random() * entrances.length)] ?? entrances[0];
      return [maze.id, entrance?.id ?? ""];
    }),
  );

  return (
    <FashionMazeExperience
      reactorConfigured={hasReactorApiKey()}
      initialEntranceVariantIds={initialEntranceVariantIds}
    />
  );
}
