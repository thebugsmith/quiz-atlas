"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  rank: number;
  display_name: string | null;
  score: number;
  correct_count: number;
  question_count: number;
  is_self: boolean;
};

type Board = {
  date: string;
  closed: boolean;
  exists: boolean;
  voided: boolean;
  void_reason: string | null;
  rows: Row[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  me: { rank: number; score: number; correct_count: number; question_count: number } | null;
};

function recentDates(count: number) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - index),
    );
    return date.toISOString().slice(0, 10);
  });
}

export function DailyLeaderboard() {
  // The page renders per request, so "today" is the request's day, not the build's.
  const [dates] = useState(() => recentDates(8));
  const [date, setDate] = useState(() => recentDates(8)[0]);
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/daily/leaderboard?date=${date}&page=${page}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setError("Could not load that leaderboard.");
      return;
    }
    setBoard(await response.json());
  }, [date, page]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/daily/leaderboard?date=${date}&page=${page}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((body: Board) => {
        if (!cancelled) setBoard(body);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load that leaderboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [date, page]);

  const lastPage = board ? Math.max(1, Math.ceil(board.total / board.limit)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="board-date" className="mb-1 block text-sm font-medium">
            Challenge date
          </label>
          <select
            id="board-date"
            className="border-border bg-surface h-10 rounded-[var(--radius-control)] border px-3 text-sm"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPage(1);
            }}
          >
            {dates.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted-foreground text-sm">
          Only completed, ranked attempts for that exact challenge are ranked.
        </p>
      </div>

      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {board && !board.exists ? (
        <p className="text-muted-foreground text-sm">No challenge was played on that date.</p>
      ) : null}

      {board?.voided ? (
        <p className="border-warning-border bg-warning-soft rounded-[var(--radius-card)] border px-4 py-3 text-sm">
          This challenge was voided{board.void_reason ? `: ${board.void_reason}` : ""}. Its results
          are kept but no longer ranked.
        </p>
      ) : null}

      {board && board.exists && !board.closed && !board.voided ? (
        <p className="text-muted-foreground text-sm">
          The board opens when this challenge closes (midnight UTC). Your own standing is visible
          now.
        </p>
      ) : null}

      {board?.me ? (
        <p className="border-border bg-surface rounded-[var(--radius-card)] border px-4 py-3 text-sm">
          Your position: <strong>#{board.me.rank}</strong> with {board.me.score} points (
          {board.me.correct_count}/{board.me.question_count} correct).
        </p>
      ) : null}

      {board && board.rows.length > 0 ? (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Daily leaderboard for {board.date}</caption>
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Rank
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Player
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Score
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Correct
                </th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row, index) => (
                <tr
                  key={`${row.rank}-${index}`}
                  className={
                    row.is_self ? "bg-primary-soft" : "border-border border-b last:border-0"
                  }
                >
                  <td className="py-2.5 pr-3 tabular-nums">{row.rank}</td>
                  <td className="py-2.5 pr-3">
                    {row.display_name ?? (
                      <span className="text-muted-foreground">Hidden player</span>
                    )}
                    {row.is_self ? <span className="text-muted-foreground"> (you)</span> : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.score}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {row.correct_count}/{row.question_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="border-border-strong bg-surface h-9 rounded-[var(--radius-control)] border px-3 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <p className="text-muted-foreground text-xs">
              Page {page} of {lastPage} · {board.total} ranked attempt
              {board.total === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
              disabled={page >= lastPage}
              className="border-border-strong bg-surface h-9 rounded-[var(--radius-control)] border px-3 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <button type="button" onClick={() => void load()} className="sr-only">
            Refresh
          </button>
        </>
      ) : null}
    </div>
  );
}
