// "What changed": field-level differences between two fetches. Only fields that matter for
// decisions are tracked, so the change log stays small.

export const PLAYER_FIELDS = ["now_cost", "status", "chance_of_playing_next_round", "news"];
export const FIXTURE_FIELDS = ["event", "kickoff_time"];

function diffBy(kind, fields, prev, next, at, extra = () => ({})) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const out = [];
  for (const x of next) {
    const old = before.get(x.id);
    if (!old) continue;
    for (const field of fields) {
      if ((old[field] ?? null) !== (x[field] ?? null)) out.push({ kind, at, id: x.id, field, from: old[field] ?? null, to: x[field] ?? null, ...extra(x) });
    }
  }
  return out;
}

export const diffPlayers = (prev, next, at) => diffBy("player", PLAYER_FIELDS, prev, next, at);
export const diffFixtures = (prev, next, at) =>
  diffBy("fixture", FIXTURE_FIELDS, prev, next, at, (f) => ({ team_h: f.team_h, team_a: f.team_a }));
