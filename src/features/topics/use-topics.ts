"use client";

import { useEffect, useState } from "react";

export type PublicTopic = {
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  displayColor: string;
  available: number;
};

/**
 * Topics and their live question counts come from `/api/topics`, which reads the
 * `content` tables. Nothing about the topic list is hardcoded in the UI.
 */
export function useTopics() {
  const [topics, setTopics] = useState<PublicTopic[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/topics")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setTopics((body?.topics ?? []) as PublicTopic[]);
      })
      .catch(() => {
        if (active) setTopics([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return topics;
}
