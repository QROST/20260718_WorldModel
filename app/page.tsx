import { FashionMazeExperience } from "@/components/FashionMazeExperience";
import { hasReactorApiKey } from "@/lib/reactor-server";

export const dynamic = "force-dynamic";

export default function Page() {
  return <FashionMazeExperience reactorConfigured={hasReactorApiKey()} />;
}
