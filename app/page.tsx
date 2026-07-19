import { FashionMazeExperience } from "@/components/FashionMazeExperience";
import { fashionMazes } from "@/lib/fashion-maze";
import { hasReactorApiKey } from "@/lib/reactor-server";

export const dynamic = "force-dynamic";

export default function Page() {
  const entrances = fashionMazes[0].entranceVariants;
  const entrance =
    entrances[Math.floor(Math.random() * entrances.length)] ?? entrances[0];

  return (
    <FashionMazeExperience
      reactorConfigured={hasReactorApiKey()}
      initialEntranceVariantId={entrance.id}
    />
  );
}
