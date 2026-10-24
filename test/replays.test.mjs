// Every own matchday leaves a compact replay: the score reproduces at minute
// 90, a goalless match still has saves and near misses, the list survives a
// repair, and a rollover starts the new season with none.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialState, playMatchday, startNextSeason, repairCareer,
  replayFields, replaySnapshot, scoreAt, keyMoments, REPLAY_MAX,
} from '../public/engine.js';

const CLUB = 'harbourside';

function played(seed, days) {
  const state = buildInitialState(CLUB, 'Alex Morgan', seed);
  for (let i = 0; i < days; i++) playMatchday(state);
  return state;
}

test('every own matchday leaves one replay, matching the Competition row', () => {
  const state = played(21, 6);
  assert.equal(state.replays.length, 6);
  for (const entry of state.replays) {
    const row = state.results.find((r) => r.matchday === entry.matchday
      && ((r.home.id === entry.home && r.away.id === entry.away)
        || (r.home.id === entry.away && r.away.id === entry.home)));
    assert.ok(row, 'the snapshot has a result row');
    assert.equal(entry.homeGoals, row.homeGoals);
    assert.equal(entry.awayGoals, row.awayGoals);
  }
  const last = state.replays[state.replays.length - 1];
  assert.equal(last.matchday, state.lastReport.matchday);
  assert.equal(last.homeGoals, state.lastReport.homeGoals);
  assert.equal(last.awayGoals, state.lastReport.awayGoals);
});

test('the replay scores the recorded result at full time and 0-0 at kick-off', () => {
  const state = played(21, 8);
  for (const entry of state.replays) {
    assert.deepEqual(scoreAt(entry.moments, 90), [entry.homeGoals, entry.awayGoals]);
    assert.deepEqual(scoreAt(entry.moments, 0), [0, 0]);
  }
});

test('a saved replay is compact: a side, a minute, a player and a detail', () => {
  const state = played(4, 3);
  const entry = state.replays[0];
  for (const m of entry.moments) {
    for (const key of Object.keys(m)) {
      assert.ok(['minute', 'type', 'side', 'playerName', 'playerOutName', 'assistName', 'detail'].includes(key),
        key + ' is kept');
    }
    assert.notEqual(m.teamName, state.lastReport.home.name);
  }
  assert.deepEqual(Object.keys(entry.stats).sort(), ['onTarget', 'possession', 'shots']);
});

test('saves are the shots on target that were not goals, plus up to two near misses', () => {
  const state = played(9, 10);
  for (const entry of state.replays) {
    for (const [side, idx] of [['home', 0], ['away', 1]]) {
      const goals = idx === 0 ? entry.homeGoals : entry.awayGoals;
      const saves = entry.moments.filter((m) => m.type === 'save' && m.side === side).length;
      const misses = entry.moments.filter((m) => m.type === 'miss' && m.side === side).length;
      assert.equal(saves, entry.stats.onTarget[idx] - goals);
      assert.ok(misses <= 2);
      assert.ok(misses <= entry.stats.shots[idx] - entry.stats.onTarget[idx]);
    }
  }
});

test('a goalless match still has saves or near misses to read', () => {
  // Seed 1, matchday 6: a 0-0 with shots at both ends.
  const state = buildInitialState(CLUB, 'Alex Morgan', 1);
  for (let i = 0; i < 6; i++) playMatchday(state);
  const r = state.lastReport;
  assert.equal(r.homeGoals, 0);
  assert.equal(r.awayGoals, 0);
  const extra = r.moments.filter((m) => m.type === 'save' || m.type === 'miss');
  assert.ok(extra.length > 0, 'a goalless match has a chance to read');
});

test('a rollover starts the next season with no replays', () => {
  const state = played(21, 34);
  assert.equal(state.replays.length, REPLAY_MAX);
  const next = startNextSeason(state);
  assert.equal(next.season, 2);
  assert.deepEqual(next.replays, []);
});

test('repair fills a missing replay list and drops what is not this season', () => {
  const state = played(21, 4);
  const repaired = repairCareer({ ...state, replays: undefined });
  assert.deepEqual(repaired.replays, []);

  const keep = state.replays[1];
  const dirty = [
    { ...keep },
    { ...keep, matchday: keep.matchday, season: 2 },
    { ...keep, homeGoals: 'two' },
    { ...keep, home: 'no-such-club' },
    { ...keep, matchday: 999 },
    null,
    'nonsense',
  ];
  const kept = replayFields({ ...state, replays: dirty });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].matchday, keep.matchday);
});

test('repair keeps one entry per matchday and caps the list', () => {
  const state = played(21, 34);
  const doubled = [...state.replays, ...state.replays];
  const kept = replayFields({ ...state, replays: doubled });
  assert.equal(kept.length, 34);
  assert.deepEqual(kept.map((r) => r.matchday), state.replays.map((r) => r.matchday));
});

test('key moments put goals first and are three at most, in minute order', () => {
  const moments = [
    { minute: 10, type: 'yellow', side: 'home', playerName: 'A' },
    { minute: 20, type: 'save', side: 'away', playerName: 'B' },
    { minute: 30, type: 'goal', side: 'home', playerName: 'C' },
    { minute: 40, type: 'sub', side: 'home', playerName: 'D' },
    { minute: 50, type: 'miss', side: 'home', playerName: 'E' },
  ];
  const keys = keyMoments(moments);
  assert.equal(keys.length, 3);
  // The goal from 30', then the save and the near miss; shown in minute order.
  assert.deepEqual(new Set(keys.map((m) => m.type)), new Set(['goal', 'save', 'miss']));
  const times = keys.map((m) => m.minute);
  assert.deepEqual(times, [20, 30, 50]);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(!keys.some((m) => m.type === 'sub'));
});

test('a match with no goals falls back to saves and bookings', () => {
  const keys = keyMoments([
    { minute: 12, type: 'yellow', side: 'home' },
    { minute: 44, type: 'save', side: 'away' },
    { minute: 70, type: 'miss', side: 'home' },
  ]);
  assert.deepEqual(new Set(keys.map((m) => m.type)), new Set(['save', 'miss', 'yellow']));
  assert.deepEqual(keys.map((m) => m.minute), [12, 44, 70]);
});

test('a snapshot copies the report without its effects or ratings', () => {
  const state = played(7, 2);
  const snap = replaySnapshot(state.lastReport, 1);
  assert.equal(snap.ratings, undefined);
  assert.equal(snap.effects, undefined);
  assert.equal(snap.home, state.lastReport.home.id);
  assert.deepEqual(snap.stats.possession, state.lastReport.stats.possession);
});
