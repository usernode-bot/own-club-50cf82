// The Competition tab's matchday history: the engine side that assembles it
// from the stored career (exact scores, credits, kick-offs) plus a
// deterministic replay of the season's matches for the minute-by-minute
// detail, gated on the replayed scoreline matching the stored one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialState,
  buildDemoState,
  playMatchday,
  playDueMatches,
  matchdayHistory,
  seasonReplay,
  previousSlot,
  slotAfter,
  firstSlotOfDay,
  creditsForResult,
  MATCH_SLOTS,
} from '../public/engine.js';

const LONDON = 'Europe/London';

// The demo career as the server serves it: London time, the next kick-off
// stamped, no stored play instants (the demo's matchdays were played without
// the schedule, so the history walks the slots back from the next one).
function demoCareer() {
  const state = buildDemoState(1);
  state.timeZone = LONDON;
  state.plays = [];
  state.nextMatchAt = firstSlotOfDay(new Date('2026-10-24T15:00:00Z'), LONDON).toISOString();
  return state;
}

test('matchdayHistory: the demo career shows all 17 matchdays, newest first, matching the stored season', () => {
  const state = demoCareer();
  const history = matchdayHistory(state);
  assert.equal(history.length, 17);
  // Newest first, 17 down to 1.
  assert.deepEqual(history.map((e) => e.matchday), [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  // Each scoreline is the stored one, and each result and Club credit follow
  // from it.
  const stored = new Map();
  for (const r of state.results) {
    if (r.home.id === state.clubId || r.away.id === state.clubId) stored.set(r.matchday, r);
  }
  for (const e of history) {
    const r = stored.get(e.matchday);
    assert.ok(r, 'matchday ' + e.matchday + ' has a stored result');
    assert.equal(e.home.id, r.home.id);
    assert.equal(e.away.id, r.away.id);
    assert.equal(e.homeGoals, r.homeGoals);
    assert.equal(e.awayGoals, r.awayGoals);
    const atHome = r.home.id === state.clubId;
    assert.equal(e.venue, atHome ? 'Home' : 'Away');
    assert.equal(e.opponentId, atHome ? r.away.id : r.home.id);
    const gf = atHome ? r.homeGoals : r.awayGoals;
    const ga = atHome ? r.awayGoals : r.homeGoals;
    assert.equal(e.result, gf > ga ? 'W' : gf < ga ? 'L' : 'D');
    assert.equal(e.credits, creditsForResult(gf, ga));
  }
});

test('matchdayHistory: demo kick-offs sit on the four slots and chain back from the next kick-off', () => {
  const state = demoCareer();
  const history = matchdayHistory(state);
  // Every kick-off is one of the day's four slots, in London wall-clock time,
  // and they strictly decrease walking back through the list.
  const hours = new Set();
  let last = null;
  for (const e of history) {
    assert.ok(e.kickoffISO, 'matchday ' + e.matchday + ' has a kick-off');
    const clock = new Intl.DateTimeFormat('en-US', {
      timeZone: LONDON, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    }).format(new Date(e.kickoffISO));
    assert.match(clock, /^(00|06|12|18):00$/, 'kick-off on a slot: ' + e.kickoffISO);
    hours.add(clock.slice(0, 2));
    if (last) assert.ok(Date.parse(e.kickoffISO) < Date.parse(last), 'strictly decreasing');
    last = e.kickoffISO;
  }
  assert.deepEqual([...hours].sort(), ['00', '06', '12', '18']);
  // The newest matchday kicked off in the slot before the career's next one.
  const prev = previousSlot(new Date(state.nextMatchAt), LONDON);
  assert.equal(new Date(history[0].kickoffISO).getTime(), prev.getTime());
});

test('matchdayHistory: an untouched season replays exactly, so every matchday keeps its events', () => {
  const state = buildInitialState('harbourside', 'Alex', 4242);
  state.timeZone = LONDON;
  state.nextMatchAt = '2026-10-20T23:00:00.000Z';
  playDueMatches(state, new Date('2026-10-21T12:00:00Z'), LONDON);
  assert.equal(state.matchday, 3);
  const history = matchdayHistory(state);
  assert.equal(history.length, 3);
  for (const e of history) {
    assert.ok(e.reconciled, 'matchday ' + e.matchday + ' reconciled');
    assert.ok(Array.isArray(e.moments) && e.moments.length > 0, 'matchday ' + e.matchday + ' has moments');
    // The replayed events add up to the stored scoreline.
    const home = e.moments.filter((m) => m.type === 'goal' && m.side === 'home').length;
    const away = e.moments.filter((m) => m.type === 'goal' && m.side === 'away').length;
    assert.equal(home, e.homeGoals, 'home goals match on matchday ' + e.matchday);
    assert.equal(away, e.awayGoals, 'away goals match on matchday ' + e.matchday);
    // The stored money entry rides along.
    assert.ok(e.money, 'matchday ' + e.matchday + ' has its money');
    assert.equal(e.money.matchday, e.matchday);
    assert.equal(e.money.income.result, e.credits);
  }
  // The replay does not disturb the stored state: a second call is identical,
  // and the career's own squads are untouched by it.
  const squadsBefore = JSON.stringify(state.squads);
  const again = matchdayHistory(state);
  assert.deepEqual(again, history);
  assert.equal(JSON.stringify(state.squads), squadsBefore);
});

test('matchdayHistory: a drifted matchday keeps its exact score and credits but drops its events', () => {
  const state = buildInitialState('harbourside', 'Alex', 4242);
  for (let i = 0; i < 3; i++) playMatchday(state);
  // The manager changes formation after matchday 3; the replay of the first
  // matchdays can no longer be trusted.
  state.tactics.formation = '5-3-2';
  for (let i = 0; i < 3; i++) playMatchday(state);
  const history = matchdayHistory(state);
  assert.equal(history.length, 6);
  const drifted = history.filter((e) => !e.reconciled);
  assert.ok(drifted.length > 0, 'at least one matchday drifted');
  for (const e of drifted) {
    assert.equal(e.moments, null, 'drifted matchday ' + e.matchday + ' has no events');
    // The stored facts are untouched by the drift.
    const stored = state.results.find((r) => r.matchday === e.matchday
      && (r.home.id === state.clubId || r.away.id === state.clubId));
    assert.equal(e.homeGoals, stored.homeGoals);
    assert.equal(e.awayGoals, stored.awayGoals);
    assert.equal(e.credits, creditsForResult(
      e.venue === 'Home' ? e.homeGoals : e.awayGoals,
      e.venue === 'Home' ? e.awayGoals : e.homeGoals,
    ));
  }
  // The newest matchday's own report is stored, so it always has its events.
  const newest = history[0];
  assert.equal(newest.matchday, 6);
  assert.ok(newest.reconciled && Array.isArray(newest.moments), 'the newest matchday keeps its events');
});

test('matchdayHistory: a career with no matchday played has an empty history and never throws', () => {
  const fresh = buildInitialState('harbourside', 'Alex', 7);
  assert.deepEqual(matchdayHistory(fresh), []);
  // A career saved before some of today's fields: still no entries, no throw.
  assert.deepEqual(matchdayHistory({ clubId: 'harbourside', season: 1, matchday: 0 }), []);
  assert.deepEqual(matchdayHistory(null), []);
  // A season that rolled over: last season's results are gone, the history
  // starts empty again.
  const state = buildInitialState('harbourside', 'Alex', 7);
  for (let i = 0; i < 2; i++) playMatchday(state);
  state.matchday = state.fixtures.length;
  state.finished = true;
  const next = { ...state, results: [], matchday: 0, finished: false, lastReport: null, financeHistory: [] };
  assert.deepEqual(matchdayHistory(next), []);
});

test('previousSlot is the exact inverse of slotAfter, across a daylight-saving change', () => {
  // Europe/London leaves BST on 25 October 2026, so the 6 am slot after it is
  // seven UTC hours after midnight, not six.
  let at = new Date('2026-10-23T00:00:00Z');
  const end = new Date('2026-10-27T00:00:00Z');
  while (at.getTime() < end.getTime()) {
    const prev = previousSlot(at, LONDON);
    assert.ok(prev, 'a slot exists before ' + at.toISOString());
    // The slot really is one of the four, in wall-clock time.
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: LONDON, hourCycle: 'h23', hour: '2-digit',
    }).format(prev));
    assert.ok(MATCH_SLOTS.includes(hour), 'slot hour ' + hour + ' is a match slot');
    assert.ok(prev.getTime() < at.getTime(), 'strictly before');
    // And slotAfter of it comes back to the instant (where the instant is a
    // slot itself; mid-slot instants round up to their next slot).
    const clock = new Intl.DateTimeFormat('en-US', {
      timeZone: LONDON, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    }).format(at);
    if (/^(00|06|12|18):00$/.test(clock)) {
      assert.equal(slotAfter(prev, LONDON).getTime(), at.getTime(),
        'round trip through ' + at.toISOString());
    }
    at = new Date(at.getTime() + 30 * 60 * 1000);
  }
  // The gap the change leaves: the 6 am slot of 25 October is 06:00Z (the
  // zone changed at 01:00 UTC), while the midnight slot before it was still
  // BST, 23:00Z on 24 October. Seven hours apart, and the pair round-trips.
  const six = new Date('2026-10-25T06:00:00Z');
  assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: LONDON, hourCycle: 'h23', hour: '2-digit' }).format(six), '06');
  assert.equal(previousSlot(six, LONDON).toISOString(), '2026-10-24T23:00:00.000Z');
  assert.equal(slotAfter(new Date('2026-10-24T23:00:00Z'), LONDON).toISOString(), '2026-10-25T06:00:00.000Z');
});

test('matchdayHistory: kick-offs match the instants playDueMatches actually played, over the DST change', () => {
  const state = buildInitialState('harbourside', 'Alex', 99);
  state.timeZone = LONDON;
  // Midnight local on 24 October, BST; the run crosses the change to GMT.
  state.nextMatchAt = '2026-10-23T23:00:00.000Z';
  const played = playDueMatches(state, new Date('2026-10-27T18:00:00Z'), LONDON);
  assert.ok(played >= 12, 'several matchdays played, got ' + played);
  const history = matchdayHistory(state);
  assert.equal(history.length, played);
  // The expected chain: the slots playDueMatches walked, oldest first.
  const expected = [];
  let cursor = '2026-10-23T23:00:00.000Z';
  for (let i = 0; i < played; i++) {
    expected.push(cursor);
    cursor = slotAfter(new Date(cursor), LONDON).toISOString();
  }
  // Newest first in the history, so compare reversed.
  const got = history.map((e) => e.kickoffISO).reverse();
  assert.deepEqual(got, expected);
  // The last MATCHES_PER_DAY kick-offs are the career's own stored instants.
  const plays = state.plays.slice();
  const tail = history.slice(0, plays.length).map((e) => e.kickoffISO).reverse();
  assert.deepEqual(tail, plays);
});

test('seasonReplay: reports come out per played matchday and leave the stored state alone', () => {
  const state = demoCareer();
  const before = JSON.stringify(state.squads) + JSON.stringify(state.results) + JSON.stringify(state.credits);
  const reports = seasonReplay(state);
  assert.equal(reports.length, 17);
  for (const r of reports) {
    assert.ok(r, 'a report per matchday');
    assert.ok(r.home && r.away && Number.isInteger(r.homeGoals) && Number.isInteger(r.awayGoals));
    assert.ok(Array.isArray(r.moments));
  }
  assert.equal(JSON.stringify(state.squads) + JSON.stringify(state.results) + JSON.stringify(state.credits), before,
    'the replay never writes to the career');
});
