import "server-only";

/**
 * One structured line per mutating request. Nothing here can carry a token, a cookie or
 * question content: the fields are enumerated.
 */
export function logApi(entry: {
  route: string;
  method: string;
  status: number;
  durationMs: number;
  requestId?: string;
  outcome: string;
}) {
  const line = {
    ts: new Date().toISOString(),
    kind: "api",
    route: entry.route,
    method: entry.method,
    status: entry.status,
    ms: Math.round(entry.durationMs),
    outcome: entry.outcome,
    requestId: entry.requestId ?? null,
  };
  // console.info keeps it out of stderr noise while still landing in the platform log.
  console.info(JSON.stringify(line));
}
