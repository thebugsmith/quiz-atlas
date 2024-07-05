/**
 * DEVELOPMENT FIXTURE — replaced by the `topics` table in milestone 03.
 *
 * Only launch topics and their presentation copy live here. No question counts,
 * scores, or player numbers: those come from the database, and inventing them
 * would misreport inventory.
 */
export type TopicFixture = {
  slug: string;
  name: string;
  description: string;
  icon: "history" | "geography" | "science" | "technology" | "sports" | "literature";
  accent: string;
};

export const topicFixtures: TopicFixture[] = [
  {
    slug: "history",
    name: "History",
    description: "Empires, revolutions, and the people who changed the map.",
    icon: "history",
    accent: "amber",
  },
  {
    slug: "geography",
    name: "Geography",
    description: "Countries, capitals, rivers, and the shape of the world.",
    icon: "geography",
    accent: "teal",
  },
  {
    slug: "science",
    name: "Science",
    description: "Physics, chemistry, biology, and the ideas underneath them.",
    icon: "science",
    accent: "violet",
  },
  {
    slug: "technology",
    name: "Technology",
    description: "Computing, engineering, and how modern tools came to be.",
    icon: "technology",
    accent: "blue",
  },
  {
    slug: "sports",
    name: "Sports",
    description: "Records, competitions, and the stories behind great seasons.",
    icon: "sports",
    accent: "rose",
  },
  {
    slug: "literature",
    name: "Literature",
    description: "Novels, poems, playwrights, and memorable lines.",
    icon: "literature",
    accent: "indigo",
  },
];

export const difficultyOptions = [
  { value: "easy", label: "Easy", description: "Straightforward recall" },
  { value: "medium", label: "Medium", description: "A little thinking required" },
  { value: "hard", label: "Hard", description: "Details and dates" },
  { value: "mixed", label: "Mixed", description: "A blend of all three" },
] as const;

export type DifficultyValue = (typeof difficultyOptions)[number]["value"];
