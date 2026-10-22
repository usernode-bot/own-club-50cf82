// The transfer market, wages, squad limits and ageing. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPS, GROUND_UPKEEP, SQUAD_MAX, SQUAD_MIN,
  buildInitialState, playMatchday, startNextSeason, ageingFor, academyGraduate,
  playerWage, wageBill, systemSaleValue, leaveError, signError, signCost,
  removePlayer, addPlayer, sellToLeague, releasePlayer, listPlayer, buyPlayer,
  returnListing, moneyFields, facilityLevels, POS_GROUP,
} from '../public/engine.js';

const CLUB = GROUPS[8].clubIds[5];

function career(seed = 3) {
  return buildInitialState(CLUB, 'Test manager', seed);
}

test('a player earns a wage by overall, halved under 21, and never under 5', () => {
  assert.equal(playerWage({ overall: 60, age: 25 }), 38);
  assert.equal(playerWage({ overall: 80, age: 30 }), 68);
  assert.equal(playerWage({ overall: 40, age: 25 }), 8);
  assert.equal(playerWage({ overall: 30, age: 25 }), 5);
  assert.equal(playerWage({ overall: 60, age: 19 }), 19);
  assert.equal(playerWage({ overall: 30, age: 18 }), 5);
  assert.equal(wageBill([{ overall: 60, age: 25 }, { overall: 40, age: 25 }]), 46);
  assert.equal(wageBill([]), 0);
});

test('a matchday pays upkeep and the whole squad its wages, never below zero', () => {
  const state = career(5);
  const bill = wageBill(state.squads[CLUB]);
  assert.ok(bill > 0);
  state.credits = 100000;
  while (state.matchday < 3) playMatchday(state);
  const f = state.finance;
  assert.equal(f.wage, bill * 3);
  const report = state.lastReport.finance;
  assert.equal(report.wageDue, bill);
  assert.equal(report.net, (report.result === 'win' ? 50 : report.result === 'draw' ? 25 : 10)
    + report.gate - report.upkeep - report.wage);

  // A club with no credits and no fans can still be paid only what it earned.
  const broke = career(5);
  broke.credits = 0;
  broke.fans = 0;
  playMatchday(broke);
  assert.ok(broke.credits >= 0);
  const earned = broke.lastReport.finance.result === 'win' ? 50
    : broke.lastReport.finance.result === 'draw' ? 25 : 10;
  assert.equal(broke.lastReport.finance.wage, Math.min(broke.lastReport.finance.wageDue, Math.max(0, earned - broke.lastReport.finance.upkeep)));
});

test('selling to the league pays a quarter of the overall, at least 5', () => {
  assert.equal(systemSaleValue({ overall: 60 }), 15);
  assert.equal(systemSaleValue({ overall: 16 }), 5);
  const state = career();
  const p = state.squads[CLUB].find((q) => POS_GROUP[q.pos] !== 'GK');
  const before = state.credits;
  const out = sellToLeague(state, p.id);
  assert.equal(out.price, systemSaleValue(p));
  assert.equal(out.state.credits, before + out.price);
  assert.equal(out.state.squads[CLUB].some((q) => q.id === p.id), false);
  // The input career is untouched.
  assert.equal(state.squads[CLUB].some((q) => q.id === p.id), true);

  const released = releasePlayer(state, p.id);
  assert.equal(released.price, 0);
  assert.equal(released.state.credits, before);
});

test('a squad cannot drop below 11 or lose its last goalkeeper', () => {
  const state = career();
  const squad = state.squads[CLUB];
  const keeper = squad.find((p) => POS_GROUP[p.pos] === 'GK');
  const spare = squad.filter((p) => POS_GROUP[p.pos] === 'GK')[1];
  // The second keeper goes: one is left, so the first cannot follow.
  assert.equal(leaveError(state, spare.id), null);
  const oneKeeper = removePlayer(state, spare.id);
  assert.equal(leaveError(oneKeeper, keeper.id), 'goalkeeper');

  const small = { ...state, squads: { ...state.squads, [CLUB]: squad.slice(0, SQUAD_MIN) } };
  assert.equal(leaveError(small, squad[0].id), 'min');
  assert.equal(leaveError(state, 'nope'), 'player');
  assert.match(JSON.stringify(releasePlayer(oneKeeper, keeper.id)), /goalkeeper/);
});

test('a signing is refused when the squad is full or the credits cannot cover it', () => {
  const state = { ...career(), credits: 10000 };
  const player = { id: 'x', name: 'Test', pos: 'CM', age: 24, overall: 60, attrs: {} };
  assert.equal(signError(state, player, 100), null);
  const full = { ...state, squads: { ...state.squads, [CLUB]: new Array(SQUAD_MAX).fill(player) } };
  assert.equal(signError(full, player, 1), 'full');
  const cost = signCost(state, player, 100000);
  const poor = { ...state, credits: cost - 1 };
  assert.equal(signError(poor, player, 100000), 'credits');
  // The up-front price alone is not enough: wages and upkeep must be left over.
  const tight = { ...state, credits: 100 };
  assert.equal(signError(tight, player, 100 - GROUND_UPKEEP), 'credits');
  assert.equal(signCost(state, player, 0), wageBill(state.squads[CLUB]) + playerWage(player) + GROUND_UPKEEP);
});

test('removing a player repairs the eleven and moves the armband to a midfielder', () => {
  const state = career();
  const captain = state.squads[CLUB].find((p) => p.captain);
  assert.ok(captain);
  const next = removePlayer(state, captain.id);
  assert.equal(next.squads[CLUB].some((p) => p.id === captain.id), false);
  assert.equal(next.roles[captain.id], undefined);
  assert.ok(next.squads[CLUB].some((p) => p.captain && POS_GROUP[p.pos] === 'MF'));
  assert.equal(next.lineup.length, 11);
  assert.ok(next.lineup.every((id) => next.squads[CLUB].some((p) => p.id === id)));
});

test('buying a player charges the price and gives them a market id', () => {
  const state = { ...career(), credits: 5000 };
  const listing = { id: 42, player: { name: 'Signing', pos: 'ST', age: 25, overall: 60, attrs: { pac: 60, pas: 60, sho: 60, def: 40, gk: 20 }, fit: 1 }, price: 2400 };
  const out = buyPlayer(state, listing);
  assert.equal(out.error, undefined);
  assert.equal(out.state.credits, 2600);
  const added = out.state.squads[CLUB].find((p) => p.id === 't42');
  assert.ok(added);
  assert.equal(added.captain, false);
  assert.equal(out.state.roles.t42, 'Poacher');
  assert.equal(state.squads[CLUB].length, 18);
});

test('listing checks the price, and withdrawing needs room', () => {
  const state = career();
  const p = state.squads[CLUB].find((q) => POS_GROUP[q.pos] !== 'GK');
  assert.equal(listPlayer(state, p.id, 0).error, 'price');
  assert.equal(listPlayer(state, p.id, 1000001).error, 'price');
  assert.equal(listPlayer(state, p.id, 1.5).error, 'price');
  const out = listPlayer(state, p.id, 2000);
  assert.equal(out.snapshot.name, p.name);
  assert.equal(out.snapshot.id, p.id);
  assert.equal(out.state.squads[CLUB].some((q) => q.id === p.id), false);

  const listing = { id: 7, player: p, price: 2000 };
  const back = returnListing(out.state, listing);
  assert.ok(back.state.squads[CLUB].some((q) => q.id === 't7'));
  const fullSquad = new Array(SQUAD_MAX).fill(p);
  assert.equal(returnListing({ ...out.state, squads: { [CLUB]: fullSquad } }, listing).error, 'full');
});

test('ageing is deterministic, declines from 30 and retires at 39', () => {
  const state = career(11);
  const players = state.squads[CLUB].map((p) => ({ ...p, age: 28 }));
  const old = { ...state, squads: { ...state.squads, [CLUB]: players } };
  const a = ageingFor(old);
  const b = ageingFor(old);
  assert.deepEqual(a, b);
  for (const p of a.players) {
    assert.equal(p.age, 29);
    assert.deepEqual(p.attrs, players.find((q) => q.id === p.id).attrs);
  }

  const older = { ...state, squads: { ...state.squads, [CLUB]: players.map((p) => ({ ...p, age: 31 })) } };
  const declined = ageingFor(older).players;
  for (const p of declined) {
    const before = older.squads[CLUB].find((q) => q.id === p.id);
    for (const k of Object.keys(before.attrs)) {
      assert.ok(p.attrs[k] < before.attrs[k], 'declined ' + k);
      assert.ok(before.attrs[k] - p.attrs[k] >= 1 && before.attrs[k] - p.attrs[k] <= 3);
      assert.ok(p.attrs[k] >= 20);
    }
  }

  for (let seed = 1; seed <= 20; seed++) {
    const young = { ...career(seed), squads: { [CLUB]: career(seed).squads[CLUB].map((p) => ({ ...p, age: 32 })) } };
    assert.equal(ageingFor(young).retiring.length, 0, 'nobody retires before 34');
    const certain = { ...young, squads: { [CLUB]: young.squads[CLUB].map((p) => ({ ...p, age: 38 })) } };
    assert.equal(ageingFor(certain).retiring.length, certain.squads[CLUB].length, 'everyone retires at 39');
  }
});

test('the rollover keeps the squad size and its goalkeepers, and signs academy graduates', () => {
  const state = career(4);
  while (!state.finished) playMatchday(state);
  // Everyone is 38, so everyone retires and is replaced.
  state.squads[CLUB] = state.squads[CLUB].map((p) => ({ ...p, age: 38 }));
  const keepers = state.squads[CLUB].filter((p) => POS_GROUP[p.pos] === 'GK').length;
  const next = startNextSeason(state);
  const squad = next.squads[CLUB];
  assert.equal(squad.length, state.squads[CLUB].length);
  assert.equal(squad.filter((p) => POS_GROUP[p.pos] === 'GK').length, keepers);
  assert.ok(squad.every((p) => p.age === 17));
  assert.ok(squad.every((p) => p.academy === next.season));
  assert.equal(next.lineup.length, 11);
});

test('a better academy brings in better young players', () => {
  const avg = (level) => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += academyGraduate(9, 2, i, 'CM', level, 3).overall;
    return sum / 10;
  };
  assert.ok(avg(5) > avg(1));
  const g = academyGraduate(9, 2, 0, 'GK', 3, 1);
  assert.equal(g.pos, 'GK');
  assert.equal(g.id, 'y2-0');
  assert.equal(g.age, 17);
});

test('moneyFields accepts a finance without wages and fills it with 0', () => {
  const state = career();
  const old = JSON.parse(JSON.stringify(state));
  old.finance = { season: old.season, gate: 40, upkeep: 12, homeGames: 2 };
  const f = moneyFields(old);
  assert.equal(f.finance.wage, 0);
  assert.equal(f.finance.gate, 40);
  assert.equal(f.finance.upkeep, 12);
});
