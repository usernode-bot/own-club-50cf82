// The transfer market, wages, squad limits and ageing. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPS, GROUND_UPKEEP, SQUAD_MAX, SQUAD_MIN,
  buildInitialState, playMatchday, startNextSeason, ageingFor, academyGraduate,
  playerWage, wageBill, systemSaleValue, leaveError, signError, signCost,
  removePlayer, addPlayer, sellToLeague, releasePlayer, listPlayer, buyPlayer,
  returnListing, moneyFields, facilityLevels, POS_GROUP,
  PEAK_NAMES, peakStyleFor, growthOutlook, buildSquad, academyIntake,
} from '../public/engine.js';

const CLUB = GROUPS[8].clubIds[5];

function career(seed = 3) {
  return buildInitialState(CLUB, 'Test manager', seed);
}

test('a club with no squad has no wage bill', () => {
  assert.equal(wageBill({ squads: {} }), 0);
});

test('a matchday pays upkeep and the whole squad its wages, never below zero', () => {
  const state = career(5);
  const bill = wageBill(state);
  assert.ok(bill > 0);
  state.credits = 100000;
  while (state.matchday < 3) playMatchday(state);
  const f = state.finance;
  assert.equal(f.wages, bill * 3);
  const report = state.lastReport.finance;
  assert.equal(report.wagesDue, bill);
  assert.equal(report.net, (report.result === 'win' ? 50 : report.result === 'draw' ? 25 : 10)
    + report.gate + report.shop + report.food + report.hotel
    - report.upkeep - report.maintenance - report.wages - report.staffWages);

  // A club with no credits and no fans can still be paid only what it earned.
  const broke = career(5);
  broke.credits = 0;
  broke.fans = 0;
  playMatchday(broke);
  assert.ok(broke.credits >= 0);
  assert.ok(broke.lastReport.finance.wages <= broke.lastReport.finance.wagesDue);
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
  assert.equal(signCost(state, player, 0), wageBill(state) + playerWage(player, 3) + GROUND_UPKEEP);
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
  const state = { ...career(), credits: 100000 };
  const listing = { id: 42, player: { name: 'Signing', pos: 'ST', age: 25, overall: 60, attrs: { pac: 60, pas: 60, sho: 60, def: 40, gk: 20 }, fit: 1 }, price: 2400 };
  const out = buyPlayer(state, listing);
  assert.equal(out.error, undefined);
  assert.equal(out.state.credits, 97600);
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

const STYLES = ['early', 'mid', 'late'];

function styledCareer(seed, age) {
  const state = career(seed);
  const players = state.squads[CLUB].map((p, i) => ({ ...p, age, peak: STYLES[i % 3] }));
  return { ...state, squads: { ...state.squads, [CLUB]: players } };
}

test('ageing is deterministic, follows the peak style and retires at 39', () => {
  const state = styledCareer(11, 28);
  const a = ageingFor(state);
  const b = ageingFor(state);
  assert.deepEqual(a, b);
  // 28 to 29: early players decline, mid players hold, late players improve.
  for (const p of a.players) {
    const before = state.squads[CLUB].find((q) => q.id === p.id);
    assert.equal(p.age, 29);
    assert.equal(p.peak, before.peak);
    for (const k of Object.keys(before.attrs)) {
      if (before.peak === 'early') {
        const drop = before.attrs[k] - p.attrs[k];
        assert.ok(drop >= 1 && drop <= 3, 'early declined ' + k);
        assert.ok(p.attrs[k] >= 20);
      } else if (before.peak === 'mid') {
        assert.equal(p.attrs[k], before.attrs[k], 'mid held ' + k);
      } else {
        const gain = p.attrs[k] - before.attrs[k];
        assert.ok(gain >= 1 && gain <= 3, 'late improved ' + k);
        assert.equal(p.attrs[k], Math.min(92, before.attrs[k] + gain));
      }
    }
  }

  // 31 to 32: early and mid players decline, late players hold.
  const older = styledCareer(11, 31);
  for (const p of ageingFor(older).players) {
    const before = older.squads[CLUB].find((q) => q.id === p.id);
    for (const k of Object.keys(before.attrs)) {
      if (before.peak === 'late') {
        assert.equal(p.attrs[k], before.attrs[k], 'late held ' + k);
      } else {
        const drop = before.attrs[k] - p.attrs[k];
        assert.ok(drop >= 1 && drop <= 3, before.peak + ' declined ' + k);
      }
    }
  }

  for (let seed = 1; seed <= 20; seed++) {
    const young = { ...career(seed), squads: { [CLUB]: career(seed).squads[CLUB].map((p) => ({ ...p, age: 32 })) } };
    assert.equal(ageingFor(young).retiring.length, 0, 'nobody retires before 34');
    const certain = { ...young, squads: { [CLUB]: young.squads[CLUB].map((p) => ({ ...p, age: 38 })) } };
    assert.equal(ageingFor(certain).retiring.length, certain.squads[CLUB].length, 'everyone retires at 39');
  }
});

test('young players grow every summer up to their peak, never above 92', () => {
  const state = styledCareer(7, 18);
  const aged = ageingFor(state);
  for (const p of aged.players) {
    const before = state.squads[CLUB].find((q) => q.id === p.id);
    for (const k of Object.keys(before.attrs)) {
      const gain = p.attrs[k] - before.attrs[k];
      assert.ok(gain >= 1 && gain <= 3, 'grew ' + k);
      assert.ok(p.attrs[k] <= 92);
    }
    assert.ok(p.overall >= before.overall, 'overall did not fall');
  }
  // An attribute already at 92 stays there while growing.
  const maxed = styledCareer(7, 18);
  maxed.squads[CLUB] = maxed.squads[CLUB].map((p) => ({ ...p, attrs: { ...p.attrs, pac: 92 } }));
  for (const p of ageingFor(maxed).players) assert.equal(p.attrs.pac, 92);
});

test('every player has a stable peak style and all three occur', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 5; seed++) {
    for (const p of career(seed).squads[CLUB]) {
      assert.ok(PEAK_NAMES.includes(p.peak));
      assert.equal(p.peak, peakStyleFor(seed, p.id));
      assert.equal(p.peak, peakStyleFor(seed, p.id));
      seen.add(p.peak);
    }
  }
  assert.deepEqual([...seen].sort(), ['early', 'late', 'mid']);

  const state = career(3);
  academyIntake(state, 1);
  for (const p of state.youth) {
    assert.ok(PEAK_NAMES.includes(p.peak));
    assert.equal(p.peak, peakStyleFor(state.seed, p.id));
  }
  const g = academyGraduate(9, 2, 0, 'CM', 3, 1);
  assert.ok(PEAK_NAMES.includes(g.peak));
  assert.equal(g.peak, peakStyleFor(9, 'y2-0'));
  assert.equal(g.peak, academyGraduate(9, 2, 0, 'CM', 3, 1).peak);
});

test('the peak field leaves generated squads exactly as they were', () => {
  // The names, ages and attributes buildSquad gave seed 3 before the field.
  const expected = [
    ['p500', 'Dario Sand', 23, { pac: 50, pas: 63, sho: 38, def: 59, gk: 63 }],
    ['p501', 'Lee Ode', 22, { pac: 47, pas: 55, sho: 40, def: 56, gk: 54 }],
    ['p502', 'Felix Tate', 23, { pac: 59, pas: 51, sho: 38, def: 57, gk: 46 }],
    ['p503', 'Ansel Ash', 32, { pac: 64, pas: 59, sho: 53, def: 69, gk: 50 }],
    ['p504', 'Sam Orr', 21, { pac: 57, pas: 57, sho: 41, def: 62, gk: 43 }],
    ['p505', 'Cyrus Zell', 30, { pac: 43, pas: 65, sho: 48, def: 66, gk: 44 }],
    ['p506', 'Ismail Ellis', 22, { pac: 55, pas: 55, sho: 36, def: 68, gk: 46 }],
    ['p507', 'Gil Yeo', 30, { pac: 54, pas: 51, sho: 42, def: 57, gk: 62 }],
    ['p508', 'Marco Hobb', 21, { pac: 42, pas: 45, sho: 55, def: 42, gk: 65 }],
    ['p509', 'Rory Pryce', 18, { pac: 59, pas: 63, sho: 44, def: 44, gk: 53 }],
    ['p510', 'Rory Bowen', 19, { pac: 62, pas: 42, sho: 60, def: 49, gk: 45 }],
    ['p511', 'Dunn Ruiz', 32, { pac: 56, pas: 47, sho: 44, def: 46, gk: 56 }],
    ['p512', 'Hal Nunn', 23, { pac: 59, pas: 48, sho: 57, def: 51, gk: 65 }],
    ['p513', 'Kian Marsh', 21, { pac: 42, pas: 52, sho: 44, def: 46, gk: 50 }],
    ['p514', 'Milo Lunn', 29, { pac: 65, pas: 52, sho: 66, def: 49, gk: 65 }],
    ['p515', 'Jude Yeo', 28, { pac: 55, pas: 49, sho: 66, def: 49, gk: 48 }],
    ['p516', 'Luca Tate', 27, { pac: 49, pas: 56, sho: 62, def: 50, gk: 62 }],
    ['p517', 'Umar Lund', 26, { pac: 65, pas: 55, sho: 60, def: 49, gk: 64 }],
  ];
  const squad = buildSquad(3, 5, 2, 3);
  assert.equal(squad.length, expected.length);
  squad.forEach((p, i) => {
    const [id, name, age, attrs] = expected[i];
    assert.equal(p.id, id);
    assert.equal(p.name, name);
    assert.equal(p.age, age);
    assert.deepEqual(p.attrs, attrs);
  });
});

test('older careers gain a peak style at their next rollover', () => {
  const state = career(4);
  while (!state.finished) playMatchday(state);
  state.squads[CLUB] = state.squads[CLUB].map((p) => {
    const copy = { ...p, age: 20 };
    delete copy.peak;
    return copy;
  });
  const next = startNextSeason(state);
  const squad = next.squads[CLUB];
  assert.equal(squad.length, state.squads[CLUB].length);
  for (const p of squad) {
    assert.ok(PEAK_NAMES.includes(p.peak));
    assert.equal(p.peak, peakStyleFor(state.seed, p.id));
  }
});

test('the rollover and the transfer market keep a stored peak style', () => {
  const state = career(4);
  while (!state.finished) playMatchday(state);
  state.squads[CLUB] = state.squads[CLUB].map((p) => ({ ...p, age: 20, peak: 'late' }));
  const next = startNextSeason(state);
  assert.ok(next.squads[CLUB].every((p) => p.peak === 'late'));

  const market = { ...career(6), credits: 100000 };
  const p = market.squads[CLUB].find((q) => POS_GROUP[q.pos] !== 'GK');
  const snapshot = listPlayer(market, p.id, 2000).snapshot;
  assert.equal(snapshot.peak, p.peak);
  const bought = buyPlayer(market, { id: 7, player: snapshot, price: 2000 });
  assert.equal(bought.state.squads[CLUB].find((q) => q.id === 't7').peak, p.peak);
});

test('the outlook names the peak age and the coming summer', () => {
  const state = { seed: 3 };
  const player = (peak, age) => ({ id: 'p1', peak, age });
  assert.equal(growthOutlook(state, player('mid', 26)).next, 'improving');
  assert.equal(growthOutlook(state, player('mid', 28)).next, 'steady');
  assert.equal(growthOutlook(state, player('mid', 29)).next, 'declining');
  assert.equal(growthOutlook(state, player('early', 22)).next, 'improving');
  assert.equal(growthOutlook(state, player('late', 31)).next, 'steady');
  assert.equal(growthOutlook(state, player('early', 30)).peakAge, 23);
  assert.equal(growthOutlook(state, player('mid', 30)).peakAge, 27);
  assert.equal(growthOutlook(state, player('late', 30)).peakAge, 30);
  // A stored style that is not one of the three is resolved from the seed.
  const unset = growthOutlook(state, { id: 'p9', peak: 'nonsense', age: 20 });
  assert.equal(unset.style, peakStyleFor(3, 'p9'));
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
  assert.equal(f.finance.wages, 0);
  assert.equal(f.finance.gate, 40);
  assert.equal(f.finance.upkeep, 12);
});
