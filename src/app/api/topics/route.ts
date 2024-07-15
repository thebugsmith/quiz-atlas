import { getServiceClient } from "@/server/supabase";
import { gameJson, publicJson } from "@/features/quiz/api-helpers";

type TopicSummary = {
  slug: string;
  name: string;
  description: string;
  icon_key: string;
  display_color: string;
  sort_order: number;
  available: number | string;
};

/**
 * Public topic summaries with the number of questions a player could actually be
 * served right now. Counts come from the bank, never from a fixture; `content` is
 * private, so the read goes through a server-only database function.
 */
export async function GET() {
  const { data, error } = await getServiceClient().rpc("topic_summaries" as never, {} as never);

  if (error) return gameJson({ error: "query_failed" }, 500);

  const topics = (data ?? []) as unknown as TopicSummary[];

  return publicJson({
    topics: topics.map((topic) => ({
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      iconKey: topic.icon_key,
      displayColor: topic.display_color,
      available: Number(topic.available),
    })),
  });
}
