// Own Club's football engine: everything that decides how a season and a
// match play out, with no DOM and no network. The app (public/app.js) runs it
// and saves the state it returns; the server (server.js) uses it to build the
// first version of a career and the staging demo.
//
// Everything here is deterministic: the same state and the same seed produce
// the same match, every time. Randomness comes only from mulberry32 streams
// seeded from the career seed.

// All fictional. `rep` is the board's 1 to 5 star standing, which sets the
// quality of the squad it is dealt. The pyramid itself is built below, after
// the formations, because a generated club is dealt one of them.
const COASTAL_CLUBS = [
  { id: 'harbourside', name: 'Harbourside FC', short: 'HF', city: 'Harbourside', kit: 16, rep: 4, formation: '4-3-3', objective: 'Finish in the top half', ground: 'The Quay' },
  { id: 'redvale', name: 'Redvale Athletic', short: 'RA', city: 'Redvale', kit: 12, rep: 5, formation: '4-2-3-1', objective: 'Win the league', ground: 'Redvale Park' },
  { id: 'kingsmoor', name: 'Kingsmoor United', short: 'KU', city: 'Kingsmoor', kit: 7, rep: 5, formation: '4-3-3', objective: 'Win the league', ground: 'Kingsmoor Road' },
  { id: 'northmoor', name: 'Northmoor Town', short: 'NT', city: 'Northmoor', kit: 15, rep: 4, formation: '4-4-2', objective: 'Finish in the top half', ground: 'Moor Lane' },
  { id: 'baymouth', name: 'Baymouth Rovers', short: 'BR', city: 'Baymouth', kit: 10, rep: 3, formation: '4-4-2', objective: 'Finish in the top half', ground: 'The Harbour End' },
  { id: 'saltmarsh', name: 'Saltmarsh City', short: 'SM', city: 'Saltmarsh', kit: 3, rep: 3, formation: '3-5-2', objective: 'Finish in the top half', ground: 'Marsh Field' },
  { id: 'cliffton', name: 'Cliffton Wanderers', short: 'CW', city: 'Cliffton', kit: 11, rep: 3, formation: '5-3-2', objective: 'Avoid finishing bottom', ground: 'Cliff Top' },
  { id: 'marrow', name: 'Marrow Bay', short: 'MB', city: 'Marrow', kit: 8, rep: 2, formation: '4-3-3', objective: 'Avoid finishing bottom', ground: 'Bay Side' },
  { id: 'gullport', name: 'Gullport United', short: 'GU', city: 'Gullport', kit: 9, rep: 2, formation: '4-4-2', objective: 'Avoid finishing bottom', ground: 'The Nest' },
  { id: 'kestrel', name: 'Kestrel Park', short: 'KP', city: 'Kestrel', kit: 4, rep: 1, formation: '5-3-2', objective: 'Avoid finishing bottom', ground: 'Kestrel Lane' },
];

// ── Formations, mentalities, pressing, roles ─────────────────────────────
// A slot's coordinates are 0..1 on the drawn pitch: x across, y down from the
// opponent's goal line (the goalkeeper sits near the bottom).
export const FORMATIONS = {
  '4-4-2': {
    att: 1.0, mid: 1.0, def: 1.0,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.13, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.87, y: 0.71 },
      { pos: 'LM', x: 0.13, y: 0.45 }, { pos: 'CM', x: 0.38, y: 0.47 }, { pos: 'CM', x: 0.62, y: 0.47 }, { pos: 'RM', x: 0.87, y: 0.45 },
      { pos: 'ST', x: 0.36, y: 0.18 }, { pos: 'ST', x: 0.64, y: 0.18 },
    ],
  },
  '4-3-3': {
    att: 1.08, mid: 1.02, def: 0.96,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.14, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.86, y: 0.71 },
      { pos: 'CM', x: 0.28, y: 0.45 }, { pos: 'CM', x: 0.5, y: 0.47 }, { pos: 'CM', x: 0.72, y: 0.45 },
      { pos: 'LW', x: 0.17, y: 0.19 }, { pos: 'ST', x: 0.5, y: 0.15 }, { pos: 'RW', x: 0.83, y: 0.19 },
    ],
  },
  '4-2-3-1': {
    att: 1.04, mid: 1.06, def: 0.98,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.14, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.86, y: 0.71 },
      { pos: 'DM', x: 0.37, y: 0.54 }, { pos: 'DM', x: 0.63, y: 0.54 },
      { pos: 'LW', x: 0.15, y: 0.31 }, { pos: 'AM', x: 0.5, y: 0.33 }, { pos: 'RW', x: 0.85, y: 0.31 },
      { pos: 'ST', x: 0.5, y: 0.14 },
    ],
  },
  '3-5-2': {
    att: 1.02, mid: 1.1, def: 0.92,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'CB', x: 0.25, y: 0.74 }, { pos: 'CB', x: 0.5, y: 0.76 }, { pos: 'CB', x: 0.75, y: 0.74 },
      { pos: 'LM', x: 0.1, y: 0.45 }, { pos: 'CM', x: 0.31, y: 0.47 }, { pos: 'CM', x: 0.5, y: 0.43 }, { pos: 'CM', x: 0.69, y: 0.47 }, { pos: 'RM', x: 0.9, y: 0.45 },
      { pos: 'ST', x: 0.36, y: 0.18 }, { pos: 'ST', x: 0.64, y: 0.18 },
    ],
  },
  '5-3-2': {
    att: 0.94, mid: 1.0, def: 1.1,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.09, y: 0.68 }, { pos: 'CB', x: 0.3, y: 0.75 }, { pos: 'CB', x: 0.5, y: 0.77 }, { pos: 'CB', x: 0.7, y: 0.75 }, { pos: 'RB', x: 0.91, y: 0.68 },
      { pos: 'CM', x: 0.27, y: 0.44 }, { pos: 'CM', x: 0.5, y: 0.46 }, { pos: 'CM', x: 0.73, y: 0.44 },
      { pos: 'ST', x: 0.36, y: 0.17 }, { pos: 'ST', x: 0.64, y: 0.17 },
    ],
  },
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

// ── The pyramid ──────────────────────────────────────────────────────────
// The Coastal League has three tiers and 306 clubs. Division 1 is one group
// of 18; Division 2 has four groups, A to D, and Division 3 has twelve, A to
// L. The ten original clubs form most of Division 1; the other 296 are
// generated from a fixed seed, so every career meets the same clubs by the
// same names. A club's tier sets the strength of its squad (see attrRange):
// Division 1 is the strongest.
export const LEAGUE_NAME = 'The Coastal League';
export const TIER_COUNT = 3;
export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
// How many groups each tier has. Division 1's one group has no letter.
export const GROUP_COUNTS = { 1: 1, 2: 4, 3: 12 };
export const DIVISION_SIZE = 18;
export const MATCHDAYS = (DIVISION_SIZE - 1) * 2;
// The eight flat divisions a version 2 career was saved in.
export const LEGACY_DIVISION_COUNT = 8;
export const CLUB_COUNT = 306;

const PYRAMID_SEED = 50731;
const PYRAMID_CLUBS = CLUB_COUNT - COASTAL_CLUBS.length;

const PLACE_POOL = [
  'Ashcombe', 'Bracken', 'Fenwick', 'Lowmere', 'Ostrey', 'Pellow', 'Marwick', 'Tarnbrook',
  'Wexley', 'Hollins', 'Ivybridge', 'Jarrow', 'Kelbrook', 'Larkspur', 'Mossley', 'Netherby',
  'Oakhurst', 'Penrose', 'Quarrydale', 'Rosemarket', 'Stonebury', 'Thornleigh', 'Underhill',
  'Valebrook', 'Westhaven', 'Yarrow', 'Aldermere', 'Briarwood', 'Coldharbour', 'Dunmore',
  'Eastgate', 'Fairholt', 'Glenross', 'Hartwell', 'Ingleby', 'Kirkstone', 'Longmarsh',
  'Millbrook', 'Northgate', 'Overton', 'Pinewood', 'Redmoss', 'Saltby', 'Torcross',
  'Uppermill', 'Wrenfield', 'Yewdale', 'Barrowden',
];
const CLUB_SUFFIXES = ['FC', 'Athletic', 'Town', 'United', 'Rovers', 'City', 'Wanderers'];
// The naming grammar every club follows: an invented city stem plus one
// generic suffix. These twelve are the league's full suffix palette; the
// shipped clubs use the seven in CLUB_SUFFIXES and keep the names they were
// saved with — a club's id is its name's slug, so renaming one would move
// every career, listing and owner row that points at it. If the set is ever
// regenerated, use the full palette and grow app.js's displayName regex to
// match.
export const CLUB_NAME_SUFFIXES = ['Athletic', 'United', 'City', 'Town', 'Sporting', 'Rovers', 'Wanderers', 'Albion', 'Union', 'FC', 'SC', 'AC'];
const GROUND_WORDS = ['Road', 'Lane', 'Park', 'Field', 'End', 'Green', 'Way', 'Quay', 'Ground', 'Arena'];

// Real football stays out of the game. A club whose normalised name matches
// the club list is never generated, and the tests hold every name, stadium
// and code against them. A few stems happen to be small real towns; the
// invented suffixes keep those clubs fictional.
export const REAL_CLUB_DENYLIST = [
  // Premier League and EFL, in their common forms.
  'Arsenal', 'Arsenal FC', 'Aston Villa', 'AFC Bournemouth', 'Bournemouth', 'Brentford FC', 'Brentford',
  'Brighton and Hove Albion', 'Burnley FC', 'Burnley', 'Chelsea FC', 'Chelsea', 'Crystal Palace FC',
  'Everton FC', 'Everton', 'Fulham FC', 'Leeds United', 'Liverpool FC', 'Liverpool', 'Manchester City',
  'Manchester United', 'Newcastle United', 'Nottingham Forest', 'Sheffield United', 'Sunderland AFC',
  'Sunderland', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers', 'Wolves',
  'Leicester City', 'Ipswich Town', 'Southampton FC', 'Luton Town', 'Hull City', 'Middlesbrough FC',
  'Middlesbrough', 'Norwich City', 'Swansea City', 'Watford FC', 'West Bromwich Albion', 'Stoke City',
  'Derby County', 'Preston North End', 'Blackburn Rovers', 'Bristol City', 'Millwall FC', 'Millwall',
  'Queens Park Rangers', 'QPR', 'Coventry City', 'Sheffield Wednesday', 'Charlton Athletic',
  'Bolton Wanderers', 'Wigan Athletic', 'Reading FC', 'Huddersfield Town', 'Blackpool FC', 'Port Vale',
  'Rotherham United', 'Oxford United', 'Doncaster Rovers', 'Barnsley FC', 'Wrexham AFC', 'Stockport County',
  'Leyton Orient', 'Stevenage FC', 'Lincoln City', 'Wycombe Wanderers', 'Peterborough United',
  'Gillingham FC', 'Crewe Alexandra', 'Shrewsbury Town', 'Fleetwood Town', 'Accrington Stanley',
  'Swindon Town', 'Grimsby Town', 'Carlisle United', 'Barrow AFC', 'Tranmere Rovers', 'Oldham Athletic',
  'Hartlepool United', 'York City', 'Halifax Town', 'Aldershot Town', 'Boston United',
  // Scottish and Welsh football's famous names.
  'Celtic FC', 'Celtic', 'Rangers FC', 'Rangers', 'Aberdeen FC', 'Heart of Midlothian', 'Hibernian FC',
  'Dundee United', 'Motherwell FC', 'Kilmarnock FC', 'St Mirren', 'Dundee FC', 'Cardiff City',
  'Newport County', 'Albion Rovers',
  // The major European clubs.
  'Real Madrid', 'FC Barcelona', 'Barcelona', 'Atletico Madrid', 'Athletic Bilbao', 'Real Sociedad',
  'Real Betis', 'Sevilla FC', 'Valencia CF', 'Villarreal CF', 'Bayern Munich', 'Borussia Dortmund',
  'RB Leipzig', 'Bayer Leverkusen', 'Eintracht Frankfurt', 'Borussia Monchengladbach', 'Paris Saint-Germain',
  'Olympique Lyonnais', 'Olympique de Marseille', 'AS Monaco', 'Juventus', 'AC Milan', 'Inter Milan',
  'SSC Napoli', 'AS Roma', 'SS Lazio', 'ACF Fiorentina', 'Atalanta BC', 'AFC Ajax', 'PSV Eindhoven',
  'Feyenoord', 'SL Benfica', 'FC Porto', 'Sporting CP', 'Galatasaray', 'Fenerbahce SK', 'Besiktas JK',
  'Olympiacos FC', 'Panathinaikos FC', 'Red Star Belgrade', 'Club Brugge', 'RSC Anderlecht',
  'FC Basel', 'Red Bull Salzburg', 'Celtic Glasgow',
];
// Stadium names real football is known by; a generated ground never matches.
export const REAL_STADIUM_DENYLIST = [
  'Old Trafford', 'Anfield', 'Goodison Park', 'Emirates Stadium', 'Etihad Stadium', 'Stamford Bridge',
  'Tottenham Hotspur Stadium', 'London Stadium', 'Wembley Stadium', 'Villa Park', 'St James Park',
  'Elland Road', 'Hillsborough Stadium', 'Bramall Lane', 'King Power Stadium', 'Amex Stadium',
  'Camp Nou', 'Santiago Bernabeu', 'Metropolitano Stadium', 'Allianz Arena', 'Signal Iduna Park',
  'San Siro', 'Stadio Giuseppe Meazza', 'Juventus Stadium', 'Parc des Princes', 'Estadio da Luz',
  'Estadio do Dragao', 'Celtic Park', 'Ibrox Stadium', 'Estadio Azteca', 'Maracana',
];

// Case, accents and spacing never hide a match: "Paris Saint-Germain" and
// "paris  saint–germain" land on the same normalised name.
export function normalizeClubName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A club's three-letter code, unique across the whole pyramid: the stem's
// first three letters, then its first three consonants, then the stem's first
// two letters plus the suffix's initial, then letters A to Z, then a final
// sweep that always terminates. Pure string work, no rng draw, so it cannot
// move a single card in any stream.
function clubCode(name, used) {
  const [stem, suffix = ''] = name.split(' ');
  const up = stem.toUpperCase().replace(/[^A-Z]/g, '');
  const consonants = up.replace(/[AEIOU]/g, '');
  const candidates = [];
  if (up.length >= 3) candidates.push(up.slice(0, 3));
  if (consonants.length >= 3) candidates.push(consonants.slice(0, 3));
  if (up.length >= 2 && suffix) candidates.push(up.slice(0, 2) + suffix[0].toUpperCase());
  if (up.length >= 2) {
    for (let i = 0; i < 26; i++) candidates.push(up.slice(0, 2) + String.fromCharCode(65 + i));
    for (const a of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      for (const b of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') candidates.push(up[0] + a + b);
    }
  }
  for (const c of candidates) if (!used.has(c)) return c;
  return up.slice(0, 3);
}

// Kit colours live in the stylesheet as tokens (styles/tailwind-input.css,
// --kit-0 to --kit-16 with a -s secondary each): a club carries its index,
// never a colour, so re-theming stays a stylesheet edit. Index 16 is
// Harbourside's, the pitch token itself.
// The reputation a generated club is dealt, by its place in its division. The
// whole pattern drops a rung in the bottom half of the pyramid.
const GENERATED_REPS = [3, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function objectiveForRep(rep) {
  if (rep >= 5) return 'Win the league';
  if (rep >= 3) return 'Finish in the top half';
  return 'Avoid finishing bottom';
}

function uniqueShort(name, used) {
  const [place, suffix] = name.split(' ');
  const p = place.toUpperCase();
  const candidates = [p[0] + suffix[0].toUpperCase(), p.slice(0, 2)];
  for (const ch of p.slice(1)) candidates.push(p[0] + ch);
  for (let i = 0; i < 26; i++) candidates.push(p[0] + String.fromCharCode(65 + i));
  for (const c of candidates) if (!used.has(c)) return c;
  return p.slice(0, 2);
}

// One stadium word per club that shares a stem: a drawn word stays unless an
// earlier club of the same stem already took it, in which case the club takes
// the first free word in a hash order of its own. Runs after the generation
// draws, so no stream moves and no formation changes.
function uniqueGrounds(clubs) {
  const taken = new Map();
  for (const c of clubs) {
    const stem = c.name.split(' ')[0];
    const word = c.ground.slice(stem.length + 1);
    const used = taken.get(stem) || new Set();
    if (!used.has(word)) {
      used.add(word);
      taken.set(stem, used);
      continue;
    }
    const free = GROUND_WORDS
      .slice()
      .sort((a, b) => hash(PYRAMID_SEED, 'stadium', stem, a) - hash(PYRAMID_SEED, 'stadium', stem, b))
      .find((w) => !used.has(w));
    c.ground = stem + ' ' + free;
    used.add(free);
  }
}

function generateClubs() {
  const rng = mulberry32(hash(PYRAMID_SEED, 'clubs'));
  const combos = [];
  for (const place of PLACE_POOL) for (const suffix of CLUB_SUFFIXES) combos.push({ place, suffix });
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  const names = new Set(COASTAL_CLUBS.map((c) => c.name));
  const shorts = new Set(COASTAL_CLUBS.map((c) => c.short));
  const denied = new Set(REAL_CLUB_DENYLIST.map(normalizeClubName));
  const out = [];
  for (const { place, suffix } of combos) {
    if (out.length === PYRAMID_CLUBS) break;
    const name = place + ' ' + suffix;
    if (names.has(name)) continue;
    if (denied.has(normalizeClubName(name))) continue;
    names.add(name);
    const short = uniqueShort(name, shorts);
    shorts.add(short);
    const n = out.length;
    // The reputation block, one per 18 generated clubs: the first club of
    // each block is the strongest. The whole pattern drops a rung from block
    // 5 down, so every Division 3 club (blocks 6 to 17) is a little weaker.
    const block = n < 8 ? 1 : 2 + Math.floor((n - 8) / DIVISION_SIZE);
    const pos = n < 8 ? n : (n - 8) % DIVISION_SIZE;
    const rep = Math.max(1, GENERATED_REPS[pos] - (block >= 5 ? 1 : 0));
    out.push({
      id: slugify(name),
      name,
      short,
      city: place,
      kit: n % 16,
      rep,
      formation: FORMATION_NAMES[Math.floor(rng() * FORMATION_NAMES.length)],
      objective: objectiveForRep(rep),
      ground: place + ' ' + GROUND_WORDS[Math.floor(rng() * GROUND_WORDS.length)],
    });
  }
  uniqueGrounds(out);
  return out;
}

// Codes are claimed in CLUBS order, the ten original clubs first, so a
// generated club that would draw the same three letters falls down the ladder.
const ALL_CLUBS = COASTAL_CLUBS.concat(generateClubs());
const usedCodes = new Set();
for (const c of ALL_CLUBS) {
  c.code = clubCode(c.name, usedCodes);
  usedCodes.add(c.code);
}
export const CLUBS = ALL_CLUBS;
export const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
const CLUB_INDEX = Object.fromEntries(CLUBS.map((c, i) => [c.id, i]));
export const COASTAL_IDS = COASTAL_CLUBS.map((c) => c.id);

// A place's name: "Division 1", "Division 2 Group B".
export function groupName(tier, group) {
  return 'Division ' + tier + (group ? ' Group ' + group : '');
}

// The seventeen groups of the pyramid in order: Division 1, then Division 2
// A to D, then Division 3 A to L. A club's place in the CLUBS list decides
// its starting group: every 18 clubs is one group.
export const GROUPS = [];
for (let tier = 1; tier <= TIER_COUNT; tier++) {
  for (let k = 0; k < GROUP_COUNTS[tier]; k++) {
    const group = GROUP_COUNTS[tier] === 1 && tier === 1 ? null : GROUP_LETTERS[k];
    GROUPS.push({ tier, group, name: groupName(tier, group), clubIds: [] });
  }
}
CLUBS.forEach((c, i) => GROUPS[Math.floor(i / DIVISION_SIZE)].clubIds.push(c.id));
export const clubToGroup = Object.fromEntries(
  GROUPS.flatMap((g, i) => g.clubIds.map((id) => [id, i]))
);

// Where a group sits in the pyramid's promotion and relegation. The GROUPS
// index of the first Division 2 group and of the first Division 3 group.
const D2_FIRST = 1;
const D3_FIRST = 1 + GROUP_COUNTS[2];

// The three Division 3 groups under a Division 2 group, in letter order:
// A, B and C under Division 2 A, and so on. The argument is a GROUPS index.
export function feederIndices(d2Index) {
  const k = d2Index - D2_FIRST;
  return [0, 1, 2].map((j) => D3_FIRST + k * 3 + j);
}

// The Division 2 group above a Division 3 group, as a GROUPS index.
export function parentIndex(d3Index) {
  return D2_FIRST + Math.floor((d3Index - D3_FIRST) / 3);
}

// Which of a Division 2 group's three feeders a relegated club joins, by its
// finish: 18th and 17th go to the first, 16th and 15th to the second, 14th
// and 13th to the third.
export function relegationFeeder(rank) {
  if (rank >= 17) return 0;
  if (rank >= 15) return 1;
  return 2;
}

// Every club in the pyramid is for sale; the server holds the price by tier.
// Why a purchase is refused, or null when it can go ahead.
export function purchaseError(clubId, balance, price) {
  if (!CLUB_BY_ID[clubId]) return 'club';
  if (!(typeof balance === 'number' && balance >= price)) return 'balance';
  return null;
}

// The tier the manager's club plays in today, which sets what a sale pays.
// A version 3 career knows the division it is in; a version 2 career's old
// division maps the way its rollover maps it (Division 1 stays, Division 2
// stays, every other division becomes Division 3). A version 1 career is the
// old ten-club league, which became Division 1.
export function clubTier(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 1;
  if (state.version >= 3) {
    const known = Array.isArray(state.groups) && state.groups[state.groupIndex];
    const division = state.division;
    return known && Number.isInteger(division) && division >= 1 && division <= TIER_COUNT
      ? division : 1;
  }
  if (state.version >= 2) {
    if (state.division === 1) return 1;
    if (state.division === 2) return 2;
    return 3;
  }
  return 1;
}

// What selling the club pays, by the tier it is in when it is sold. The
// values are the server's; a tier with no value pays nothing.
export function saleValue(state, values) {
  const value = values ? values[clubTier(state)] : null;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

// Club credits: the club's own in-game currency, earned by result, by the
// home gate and by what the crowd spends at the shop, food stand and hotel,
// less ground upkeep, and kept with the career. Facility upgrades spend them;
// the training ground will spend them too.
export const CREDIT_REWARDS = { win: 50, draw: 25, loss: 10 };

// How many matchdays of Club credits in and out the Finance tab keeps: this
// season's most recent ones, newest first.
export const FINANCE_HISTORY_MAX = 10;

export function creditsForResult(goalsFor, goalsAgainst) {
  if (goalsFor > goalsAgainst) return CREDIT_REWARDS.win;
  if (goalsFor < goalsAgainst) return CREDIT_REWARDS.loss;
  return CREDIT_REWARDS.draw;
}

// Fans and the ground they come to. Fans are per career, start at a figure set
// by the division and carry across seasons; the ground's capacity sets how
// many of them can buy a seat.
export const FAN_SEED = { 1: 15000, 2: 6000, 3: 2500 };
// The most fans a division holds; a stadium seats no more than that, and a
// club never grows past it however well it plays.
export const FAN_CAP = { 1: 30000, 2: 12000, 3: 5000 };
export const GROUND_CAPACITY = FAN_CAP;
export const TICKET_PRICE = 5;
export const FAN_CHANGE = { win: 0.05, draw: 0.02, loss: -0.03 };
// Flat ground upkeep; facilities above level 1 add maintenance on top.
export const GROUND_UPKEEP = 250;

// The stadium's seats, matching the facility text. A home gate is the smaller
// of the fans, these seats and the division's fan limit.
export const STADIUM_SEATS = [2000, 5000, 10000, 20000, 40000];

export function stadiumSeats(state) {
  return STADIUM_SEATS[facilityLevels(state).stadium - 1];
}

// Facilities that bring extra fans through the gate on a home matchday: each
// level above 1 adds a share of the fan base to the crowd.
export const CROWD_FACILITIES = ['toilets', 'parking', 'vip'];
export const CROWD_BONUS = { 1: 0, 2: 0.02, 3: 0.04, 4: 0.06, 5: 0.08 };

export function crowdBonus(state) {
  const levels = facilityLevels(state);
  return CROWD_FACILITIES.reduce((sum, key) => sum + (CROWD_BONUS[levels[key]] || 0), 0);
}

// The crowd a home match draws: the fans, plus the crowd facilities' share,
// never more than the stadium's seats or the division's fan limit. The bonus
// never changes the fan total itself.
export function homeCrowd(state, fans, cap) {
  const seats = stadiumSeats(state);
  const base = Math.min(fans, seats, cap);
  const attendance = Math.min(fans + Math.round(fans * crowdBonus(state)), seats, cap);
  return { attendance, extra: attendance - base };
}

// What every facility above level 1 costs to run each matchday.
export const MAINTENANCE = { 1: 0, 2: 150, 3: 500, 4: 1500, 5: 4000 };

export function maintenanceDue(state) {
  const levels = facilityLevels(state);
  return FACILITIES.reduce((sum, f) => sum + (MAINTENANCE[levels[f.key]] || 0), 0);
}

// What the crowd spends at the shop, the food stand and the hotel on a home
// matchday: Club credits for every 10 fans in the ground, by facility level.
export const MATCHDAY_SALES = {
  shop: [4, 6, 10, 15, 22],
  food: [3, 5, 8, 12, 18],
  hotel: [1, 2, 4, 7, 12],
};

export function matchdaySales(state, attendance) {
  const levels = facilityLevels(state);
  const crowd = Number.isInteger(attendance) && attendance > 0 ? attendance : 0;
  const earned = (key) => Math.floor(crowd * MATCHDAY_SALES[key][levels[key] - 1] / 10);
  return { shop: earned('shop'), food: earned('food'), hotel: earned('hotel') };
}

// Every player earns a wage each matchday, worked out from the squad and the
// division rather than stored, so promotion makes the squad dearer.
export const WAGE_RATE = { 1: 45, 2: 24, 3: 14 };

export function playerWage(player, tier) {
  const rate = WAGE_RATE[tier] || WAGE_RATE[3];
  return rate * Math.max(5, (player && player.overall ? player.overall : 0) - 40);
}

export function wageBill(state) {
  const squad = state && state.squads && state.squads[state.clubId];
  const tier = clubTier(state);
  return Array.isArray(squad) ? squad.reduce((sum, p) => sum + playerWage(p, tier), 0) : 0;
}

// The staff a club can hire. Each has a one-off fee and a wage every
// matchday until released; there is one of each.
export const STAFF_ROLES = [
  { key: 'coach', name: 'Coach', fee: 2000, wage: 300 },
  { key: 'scout', name: 'Scout', fee: 1000, wage: 150 },
  { key: 'doctor', name: 'Doctor', fee: 1000, wage: 150 },
  { key: 'physio', name: 'Physio', fee: 800, wage: 120 },
  { key: 'club', name: 'Club staff', fee: 500, wage: 80 },
];

export const STAFF_BY_KEY = Object.fromEntries(STAFF_ROLES.map((s) => [s.key, s]));

function validStaffMember(m) {
  return !!m && typeof m === 'object' && !Array.isArray(m)
    && typeof m.name === 'string' && m.name
    && Number.isInteger(m.season) && Number.isInteger(m.matchday);
}

// Each staff role, hired or null, filling anything unusable with null.
export function staffFields(state) {
  const given = state && state.staff && typeof state.staff === 'object' && !Array.isArray(state.staff)
    ? state.staff : {};
  const out = {};
  for (const s of STAFF_ROLES) out[s.key] = validStaffMember(given[s.key]) ? given[s.key] : null;
  return out;
}

export function staffWagesDue(state) {
  const staff = staffFields(state);
  return STAFF_ROLES.reduce((sum, s) => sum + (staff[s.key] ? s.wage : 0), 0);
}

// Hire a role for its fee, or release it (no refund). Never mutates its input.
export function hireStaff(state, key) {
  const role = STAFF_BY_KEY[key];
  if (!role) return { error: 'role' };
  const staff = staffFields(state);
  if (staff[key]) return { error: 'hired' };
  const held = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  if (held < role.fee) return { error: 'credits' };
  const h = hash(state.seed, 'staff', key, state.season || 1, state.matchday || 0);
  const name = FIRST_NAMES[h % FIRST_NAMES.length] + ' ' + LAST_NAMES[(h >>> 8) % LAST_NAMES.length];
  return {
    state: {
      ...state,
      credits: held - role.fee,
      staff: { ...staff, [key]: { name, season: state.season || 1, matchday: state.matchday || 0 } },
    },
  };
}

export function releaseStaff(state, key) {
  if (!STAFF_BY_KEY[key]) return { error: 'role' };
  const staff = staffFields(state);
  if (!staff[key]) return { error: 'not_hired' };
  return { state: { ...state, staff: { ...staff, [key]: null } } };
}

// The academy: young players it took in, newest first, up to what the
// academy facility says it can coach.
export const ACADEMY_CAPACITY = [10, 20, 30, 45, 60];
export const ACADEMY_INTAKE = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };

export function academyCapacity(state) {
  return ACADEMY_CAPACITY[facilityLevels(state).academy - 1];
}

// Today's prospects, keeping only the entries today's screen can read.
export function youthFields(state) {
  const list = state && Array.isArray(state.youth) ? state.youth : [];
  const good = list.filter((p) => p && typeof p.id === 'string' && POS_GROUP[p.pos]
    && Number.isInteger(p.overall) && p.attrs && typeof p.attrs === 'object');
  // A downgrade can leave more prospects than the academy's new places, and
  // they all stay; 60 still bounds a malformed list.
  return good.slice(0, ACADEMY_CAPACITY[ACADEMY_CAPACITY.length - 1]);
}

// The players the academy takes in after a matchday: more and better at a
// higher level, the longest waiting leaving when it is full.
export function academyIntake(state, matchday) {
  const level = facilityLevels(state).academy;
  const season = state.season || 1;
  const cap = ACADEMY_CAPACITY[level - 1];
  const kept = (Array.isArray(state.youth) ? state.youth : []).slice();
  // Over its places after a downgrade: keep everyone and take in nobody.
  if (kept.length > cap) return state;
  const rng = mulberry32(hash(state.seed, 'youth', season, matchday));
  const used = new Set([
    ...(state.squads[state.clubId] || []).map((p) => p.name),
    ...(Array.isArray(state.youth) ? state.youth.map((p) => p.name) : []),
  ]);
  const fresh = [];
  const count = ACADEMY_INTAKE[level] || 1;
  for (let k = 0; k < count; k++) {
    const pos = SQUAD_SHAPE[Math.floor(rng() * SQUAD_SHAPE.length) % SQUAD_SHAPE.length];
    const centre = 38 + 4 * level;
    const attrs = rollAttrs(rng, pos, centre - 8, centre + 8);
    let name;
    do {
      name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
    } while (used.has(name));
    used.add(name);
    const id = 'y' + season + '-' + matchday + '-' + k;
    fresh.push({
      id: id,
      name,
      pos,
      peak: peakStyleFor(state.seed, id),
      age: 16 + Math.floor(rng() * 2),
      attrs,
      overall: overallOf(attrs, pos),
      fitness: 100,
      morale: 60,
      injury: 0,
      goals: 0,
      assists: 0,
      apps: 0,
      yellow: 0,
      red: 0,
      captain: false,
      joined: { season, matchday },
    });
  }
  state.youth = fresh.concat(kept).slice(0, cap);
  return state;
}

// Promote a prospect into the senior squad. Never mutates its input.
export function promoteYouth(state, id) {
  const youth = Array.isArray(state.youth) ? state.youth : [];
  const player = youth.find((p) => p && p.id === id);
  if (!player) return { error: 'youth' };
  const squad = (state.squads && state.squads[state.clubId]) || [];
  if (squad.length >= SQUAD_MAX) return { error: 'squad_full' };
  const player2 = { ...player, captain: false };
  delete player2.joined;
  return {
    state: {
      ...state,
      squads: { ...state.squads, [state.clubId]: squad.concat(player2) },
      youth: youth.filter((p) => p !== player),
      roles: { ...(state.roles || {}), [id]: defaultRole(player.pos) },
    },
  };
}

// One sponsor a season, paid at the rollover when its target was met. The fee
// follows the division, about a quarter of a season's gate at its starting
// fans.
export const SPONSOR_FEES = { 1: 300000, 2: 120000, 3: 50000 };
export const SPONSOR_NAMES = [
  'Harbour Lights Bakery', 'Tidewater Ferries', 'Gull Rock Cycles',
  'Saltmarsh Print Works', 'Lighthouse Radio', 'Pebble Bay Dairy',
  'Driftwood Joinery', 'Seaglass Opticians',
];
export const SPONSOR_TARGETS = ['Win the league', 'Finish in the top half', 'Avoid finishing bottom'];

export function sponsorFor(seed, season, tier) {
  const h = hash(seed, 'sponsor', season);
  return {
    name: SPONSOR_NAMES[h % SPONSOR_NAMES.length],
    target: SPONSOR_TARGETS[(h >>> 3) % SPONSOR_TARGETS.length],
    fee: SPONSOR_FEES[tier] || SPONSOR_FEES[3],
    season,
    paid: false,
  };
}

function validSponsor(s) {
  return !!s && typeof s === 'object' && !Array.isArray(s)
    && typeof s.name === 'string'
    && typeof s.target === 'string'
    && Number.isInteger(s.fee) && s.fee >= 0
    && typeof s.paid === 'boolean';
}

// This season's matchday history: the Club credits in and out of the club's
// own fixtures, newest first and capped. Anything malformed, or written by
// another season, is dropped so a forged save cannot show it.
function financeHistoryFields(state, season) {
  const given = state && Array.isArray(state.financeHistory) ? state.financeHistory : [];
  const okInt = (v) => Number.isInteger(v) && v >= 0;
  return given.filter((h) => {
    if (!h || typeof h !== 'object' || Array.isArray(h)) return false;
    if (h.season !== season) return false;
    if (!Number.isInteger(h.matchday) || h.matchday < 1) return false;
    if (h.venue !== 'Home' && h.venue !== 'Away') return false;
    if (typeof h.opponentId !== 'string' || !CLUB_BY_ID[h.opponentId]) return false;
    if (!h.income || typeof h.income !== 'object' || Array.isArray(h.income)) return false;
    if (!h.expenses || typeof h.expenses !== 'object' || Array.isArray(h.expenses)) return false;
    if (!['result', 'gate', 'shop', 'food', 'hotel'].every((k) => okInt(h.income[k]))) return false;
    if (!['upkeep', 'maintenance', 'wages', 'staffWages'].every((k) => okInt(h.expenses[k]))) return false;
    if (!Number.isInteger(h.net)) return false;
    return okInt(h.balanceAfter);
  }).slice(0, FINANCE_HISTORY_MAX).map((h) => ({
    season: h.season,
    matchday: h.matchday,
    venue: h.venue,
    opponentId: h.opponentId,
    income: {
      result: h.income.result,
      gate: h.income.gate,
      shop: h.income.shop,
      food: h.income.food,
      hotel: h.income.hotel,
    },
    expenses: {
      upkeep: h.expenses.upkeep,
      maintenance: h.expenses.maintenance,
      wages: h.expenses.wages,
      staffWages: h.expenses.staffWages,
    },
    net: h.net,
    balanceAfter: h.balanceAfter,
  }));
}

// The career's money fields, filling only what is missing or unusable, so a
// career saved before fans and sponsors existed still plays. Kept in one place
// because the server and the page both read and settle them.
export function moneyFields(state) {
  const tier = clubTier(state);
  const season = (state && state.season) || 1;
  const credits = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  const givenFans = Number.isInteger(state.fans) && state.fans >= 0 ? state.fans : FAN_SEED[tier];
  const fans = Math.min(givenFans, FAN_CAP[tier] || FAN_CAP[3]);
  const sponsor = validSponsor(state.sponsor) ? state.sponsor : sponsorFor(state.seed, season, tier);
  const lastSponsor = validSponsor(state.lastSponsor) ? state.lastSponsor : null;
  const f = state.finance;
  const financeOk = !!f && typeof f === 'object'
    && f.season === season
    && Number.isInteger(f.gate) && f.gate >= 0
    && Number.isInteger(f.upkeep) && f.upkeep >= 0
    && Number.isInteger(f.homeGames) && f.homeGames >= 0;
  const zeroTotal = (k) => (Number.isInteger(f[k]) && f[k] >= 0 ? f[k] : 0);
  const finance = financeOk
    ? {
      season: f.season,
      gate: f.gate,
      upkeep: f.upkeep,
      homeGames: f.homeGames,
      maintenance: zeroTotal('maintenance'),
      wages: zeroTotal('wages'),
      staffWages: zeroTotal('staffWages'),
      shop: zeroTotal('shop'),
      food: zeroTotal('food'),
      hotel: zeroTotal('hotel'),
    }
    : { season, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 };
  return { credits, fans, sponsor, lastSponsor, finance, financeHistory: financeHistoryFields(state, season) };
}

// Where the club's Club credits stand this season, as the Finance tab shows
// it: what came in from results, gates and the home crowd's spending, what
// went out on upkeep, maintenance and wages, and the net. Facility upgrades,
// staff fees, transfers and the sponsor's fee are left out, so the net can
// differ from the balance.
export function seasonMoney(state) {
  const m = moneyFields(state);
  const me = state.clubId;
  let results = 0;
  let won = 0;
  let drawn = 0;
  let lost = 0;
  for (const r of Array.isArray(state.results) ? state.results : []) {
    if (!r || !r.home || !r.away) continue;
    const home = r.home.id === me;
    const away = r.away.id === me;
    if (!home && !away) continue;
    const goalsFor = home ? r.homeGoals : r.awayGoals;
    const goalsAgainst = home ? r.awayGoals : r.homeGoals;
    results += creditsForResult(goalsFor, goalsAgainst);
    if (goalsFor > goalsAgainst) won++;
    else if (goalsFor < goalsAgainst) lost++;
    else drawn++;
  }
  const income = {
    results,
    gate: m.finance.gate,
    shop: m.finance.shop,
    food: m.finance.food,
    hotel: m.finance.hotel,
  };
  income.total = income.results + income.gate + income.shop + income.food + income.hotel;
  const expenses = {
    upkeep: m.finance.upkeep,
    maintenance: m.finance.maintenance,
    wages: m.finance.wages,
    staffWages: m.finance.staffWages,
  };
  expenses.total = expenses.upkeep + expenses.maintenance + expenses.wages + expenses.staffWages;
  return { income, expenses, net: income.total - expenses.total, record: { won, drawn, lost } };
}

export function fanChange(fans, goalsFor, goalsAgainst, cap) {
  const rate = goalsFor > goalsAgainst ? FAN_CHANGE.win
    : goalsFor < goalsAgainst ? FAN_CHANGE.loss
      : FAN_CHANGE.draw;
  const next = Math.max(0, Math.round(fans * (1 + rate)));
  return Number.isInteger(cap) ? Math.min(cap, next) : next;
}

// The club's facilities, each from level 1 to level 5. Upgrading one changes
// what it says it has; the toilets, parking and VIP room add fans at home, the
// shop, food stand and hotel also earn from a home crowd, and every level above
// the first costs maintenance.
export const FACILITY_MAX_LEVEL = 5;

export const FACILITIES = [
  {
    key: 'stadium',
    name: 'Stadium',
    levels: ['2,000 seats', '5,000 seats', '10,000 seats', '20,000 seats', '40,000 seats'],
  },
  {
    key: 'training',
    name: 'Training ground',
    levels: [
      '1 grass pitch',
      '2 grass pitches',
      '3 pitches and a gym',
      '4 pitches, a gym and a physio room',
      '6 pitches, a gym, a physio room and a recovery pool',
    ],
  },
  {
    key: 'academy',
    name: 'Academy',
    levels: [
      'coaching for 10 young players',
      'coaching for 20 young players',
      'coaching for 30 young players',
      'coaching for 45 young players',
      'coaching for 60 young players',
    ],
  },
  {
    key: 'shop',
    name: 'Shop',
    levels: ['a kiosk on match days', 'a small club shop', 'a club shop open all week', 'a large club shop', 'a megastore'],
  },
  {
    key: 'food',
    name: 'Food stand',
    levels: ['1 food stand', '3 food stands', '6 food stands', '10 food stands', '16 food stands'],
  },
  {
    key: 'hotel',
    name: 'Hotel',
    levels: ['10 rooms', '25 rooms', '50 rooms', '100 rooms', '200 rooms'],
  },
  {
    key: 'toilets',
    name: 'Toilets',
    levels: [
      'portable toilets',
      '2 toilet blocks, 2% more fans at home',
      '4 toilet blocks, 4% more fans at home',
      '6 toilet blocks, 6% more fans at home',
      '10 toilet blocks, 8% more fans at home',
    ],
  },
  {
    key: 'parking',
    name: 'Parking',
    levels: [
      'a gravel car park',
      '200 parking spaces, 2% more fans at home',
      '500 parking spaces, 4% more fans at home',
      '1,000 parking spaces, 6% more fans at home',
      '2,500 parking spaces and a shuttle bus, 8% more fans at home',
    ],
  },
  {
    key: 'vip',
    name: 'VIP room',
    levels: [
      'no VIP seating',
      'a VIP box, 2% more fans at home',
      '3 VIP boxes, 4% more fans at home',
      'a VIP room, 6% more fans at home',
      'a VIP room and 10 boxes, 8% more fans at home',
    ],
  },
];

export const FACILITY_BY_KEY = Object.fromEntries(FACILITIES.map((f) => [f.key, f]));

// What it costs to reach a level: the same for every facility.
export const UPGRADE_COSTS = { 2: 100, 3: 250, 4: 500, 5: 1000 };

export function upgradeCost(toLevel) {
  return Number.isInteger(toLevel) && UPGRADE_COSTS[toLevel] != null ? UPGRADE_COSTS[toLevel] : null;
}

// Every facility's level, filling a missing or unusable one with 1.
export function facilityLevels(state) {
  const given = state && state.facilities && typeof state.facilities === 'object' && !Array.isArray(state.facilities)
    ? state.facilities : {};
  const out = {};
  for (const f of FACILITIES) {
    const n = given[f.key];
    out[f.key] = Number.isInteger(n) && n >= 1 && n <= FACILITY_MAX_LEVEL ? n : 1;
  }
  return out;
}

// Raise one facility by one level in return for its cost in Club credits. The
// level asked for must be the current one plus one. Never mutates its input.
export function upgradeFacility(state, key, toLevel) {
  if (!FACILITY_BY_KEY[key]) return { error: 'facility' };
  const cost = upgradeCost(toLevel);
  if (cost == null) return { error: 'level' };
  const levels = facilityLevels(state);
  if (levels[key] + 1 !== toLevel) return { error: 'level' };
  const held = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  if (held < cost) return { error: 'credits' };
  return { state: { ...state, facilities: { ...levels, [key]: toLevel }, credits: held - cost } };
}

// Lower one facility by one level. Free, and nothing is refunded. The level
// asked for must be the current one minus one, never below 1. Never mutates
// its input.
export function downgradeFacility(state, key, toLevel) {
  if (!FACILITY_BY_KEY[key]) return { error: 'facility' };
  if (!Number.isInteger(toLevel) || toLevel < 1) return { error: 'level' };
  const levels = facilityLevels(state);
  if (levels[key] - 1 !== toLevel) return { error: 'level' };
  return { state: { ...state, facilities: { ...levels, [key]: toLevel } } };
}

// ── Transfers, wages, ageing ─────────────────────────────────────────────
// A squad holds at most 40 and at least 11, one of them a goalkeeper.
export const SQUAD_MAX = 40;
export const SQUAD_MIN = 11;
export const MARKET_PRICE_MAX = 1000000;

// What the league pays for a player sold straight to it: a quarter of the
// player's overall, at least 5.
export function systemSaleValue(p) {
  const overall = Number.isFinite(p && p.overall) ? p.overall : 0;
  return Math.max(5, Math.round(overall / 4));
}

function ownSquad(state) {
  return (state && state.squads && Array.isArray(state.squads[state.clubId]))
    ? state.squads[state.clubId] : [];
}

// Why a player cannot leave the squad, or null when they can.
export function leaveError(state, playerId) {
  const squad = ownSquad(state);
  const player = squad.find((p) => p.id === playerId);
  if (!player) return 'player';
  if (squad.length <= SQUAD_MIN) return 'min';
  if (POS_GROUP[player.pos] === 'GK' && squad.filter((p) => POS_GROUP[p.pos] === 'GK').length <= 1) {
    return 'goalkeeper';
  }
  return null;
}

// What signing a player costs: the price, one matchday of wages with him and
// the ground's upkeep.
export function signCost(state, player, price) {
  const squads = { ...(state.squads || {}), [state.clubId]: ownSquad(state).concat([player]) };
  return price + wageBill({ ...state, squads }) + GROUND_UPKEEP;
}

// Why a player cannot be signed, or null when they can.
export function signError(state, player, price) {
  if (ownSquad(state).length >= SQUAD_MAX) return 'full';
  const held = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  if (held < signCost(state, player, price)) return 'credits';
  return null;
}

// The state without a player: the roles entry goes, the armband passes to the
// best midfielder when the captain leaves, and the eleven is repaired. Never
// mutates its input.
export function removePlayer(state, id) {
  const squad = ownSquad(state);
  const leaving = squad.find((p) => p.id === id);
  const kept = squad.filter((p) => p.id !== id).map((p) => ({ ...p }));
  const roles = { ...(state.roles || {}) };
  delete roles[id];
  if (leaving && leaving.captain) {
    const mids = kept.filter((p) => POS_GROUP[p.pos] === 'MF');
    if (mids.length) {
      const cap = mids.reduce((a, b) => (b.overall > a.overall ? b : a));
      cap.captain = true;
    }
  }
  const next = {
    ...state,
    squads: { ...state.squads, [state.clubId]: kept },
    roles,
    lineup: (state.lineup || []).filter((x) => x !== id),
  };
  if (next.lineup.length < SQUAD_MIN) {
    next.lineup = autoLineup(kept, next.tactics.formation, roles);
  } else {
    fixLineup(next);
  }
  return next;
}

// The state with a new player in the squad: a new id, no armband, no last
// rating, and their default role.
export function addPlayer(state, player, newId) {
  const added = { ...player, id: newId, captain: false };
  delete added.lastRating;
  delete added.lastMinutes;
  const kept = ownSquad(state).map((p) => ({ ...p }));
  return {
    ...state,
    squads: { ...state.squads, [state.clubId]: kept.concat([added]) },
    roles: { ...(state.roles || {}), [newId]: defaultRole(player.pos) },
  };
}

// Sell a player to the league for its small fixed fee, or release them for
// nothing. Both return { state, price } or { error }.
export function sellToLeague(state, id) {
  const err = leaveError(state, id);
  if (err) return { error: err };
  const player = ownSquad(state).find((p) => p.id === id);
  const price = systemSaleValue(player);
  const next = removePlayer(state, id);
  next.credits = (Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0) + price;
  return { state: next, price };
}

export function releasePlayer(state, id) {
  const err = leaveError(state, id);
  if (err) return { error: err };
  return { state: removePlayer(state, id), price: 0 };
}

// Put a player on the market: they leave the squad now and the snapshot is
// what other managers see.
export function listPlayer(state, id, price) {
  if (!Number.isInteger(price) || price < 1 || price > MARKET_PRICE_MAX) return { error: 'price' };
  const err = leaveError(state, id);
  if (err) return { error: err };
  const player = ownSquad(state).find((p) => p.id === id);
  // The buyer sees the peak style the seller saw, even under a new market id.
  return { state: removePlayer(state, id), snapshot: { ...player, peak: playerPeak(state, player) } };
}

// Sign a listed player: the price leaves the credits and the player joins.
export function buyPlayer(state, listing) {
  const err = signError(state, listing.player, listing.price);
  if (err) return { error: err };
  const withPlayer = addPlayer(state, listing.player, 't' + listing.id);
  withPlayer.credits = state.credits - listing.price;
  return { state: withPlayer };
}

// Withdraw a listing: the player comes back, if the squad has room.
export function returnListing(state, listing) {
  if (ownSquad(state).length >= SQUAD_MAX) return { error: 'full' };
  return { state: addPlayer(state, listing.player, 't' + listing.id) };
}

// Each player peaks at one of three ages. Until the peak every attribute
// rises a little each summer, for two summers it holds, and from the decline
// age it slips again.
export const PEAK_STYLES = {
  early: { peak: 23, decline: 26 },
  mid: { peak: 27, decline: 30 },
  late: { peak: 30, decline: 33 },
};
export const PEAK_NAMES = ['early', 'mid', 'late'];

// A player's peak style from the career's seed, so a stored player without one
// still reads the same every time it is looked at.
export function peakStyleFor(seed, id) {
  return PEAK_NAMES[hash(seed, 'peak', id) % 3];
}

export function playerPeak(state, p) {
  const stored = p && typeof p.peak === 'string' && Object.prototype.hasOwnProperty.call(PEAK_STYLES, p.peak)
    ? p.peak : null;
  return stored || peakStyleFor(state && state.seed, p && p.id);
}

// The peak style, the age it comes at, and how the coming summer changes the
// player: 'improving', 'steady' or 'declining'.
export function growthOutlook(state, p) {
  const style = playerPeak(state, p);
  const { peak, decline } = PEAK_STYLES[style];
  const nextAge = (Number.isInteger(p && p.age) ? p.age : 20) + 1;
  const next = nextAge <= peak ? 'improving' : nextAge >= decline ? 'declining' : 'steady';
  return { style, peakAge: peak, next };
}

// The summer: everyone a year older, attributes rising to their peak and
// slipping afterwards, retirement possible from 34 and certain at 39. Fixed
// by the career's seed, so the season card can name the retirees before the
// rollover.
export function ageingFor(state) {
  const season = (state && state.season) || 1;
  const retiring = [];
  const players = ownSquad(state).map((p) => {
    const peak = playerPeak(state, p);
    const style = PEAK_STYLES[peak];
    const newAge = (Number.isInteger(p.age) ? p.age : 20) + 1;
    const attrs = { ...p.attrs };
    const overall = Number.isFinite(p.overall) ? p.overall : overallOf(attrs, p.pos);
    const out = { ...p, age: newAge, attrs, overall, peak };
    if (newAge <= style.peak) {
      for (const k of Object.keys(attrs)) {
        const gain = 1 + (hash(state.seed, 'grow', season, p.id, k) % 3);
        attrs[k] = Math.min(92, attrs[k] + gain);
      }
      out.overall = overallOf(attrs, p.pos);
    } else if (newAge >= style.decline) {
      for (const k of Object.keys(attrs)) {
        const drop = 1 + (hash(state.seed, 'age', season, p.id, k) % 3);
        attrs[k] = Math.max(20, attrs[k] - drop);
      }
      out.overall = overallOf(attrs, p.pos);
    }
    if (newAge >= 34 && hash(state.seed, 'retire', season, p.id) % 6 < newAge - 33) {
      retiring.push({ id: p.id, name: p.name, pos: p.pos, age: newAge });
    }
    return out;
  });
  return { players, retiring };
}

// A 17-year-old from the academy, dealt at the Academy level asked for.
export function academyGraduate(seed, season, index, pos, academyLevel, tier) {
  const rng = mulberry32(hash(seed, 'graduate', season, index));
  const rep = Math.max(1, Math.min(5, Number.isInteger(academyLevel) ? academyLevel : 1) - 1) || 1;
  const p = makePlayer(rng, pos, rep, 0, tier);
  const used = new Set();
  let name;
  do {
    name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
  } while (used.has(name));
  used.add(name);
  return {
    ...p,
    id: 'y' + season + '-' + index,
    name,
    age: 17,
    peak: peakStyleFor(seed, 'y' + season + '-' + index),
    fitness: 100,
    morale: 70,
    overall: overallOf(p.attrs, pos),
    academy: season,
  };
}

// The money a person brings to the shop: the wallet already stored for them,
// or the starting balance a first-time manager is given.
export function openingBalance(stored, startingBalance) {
  return Number.isInteger(stored) && stored >= 0 ? stored : startingBalance;
}

export const MENTALITIES = {
  Defensive: { att: 0.86, mid: 0.98, def: 1.12 },
  Balanced: { att: 1.0, mid: 1.0, def: 1.0 },
  Positive: { att: 1.06, mid: 1.02, def: 0.96 },
  Attacking: { att: 1.14, mid: 1.04, def: 0.87 },
};
export const MENTALITY_NAMES = Object.keys(MENTALITIES);

export const PRESSING = {
  Low: { mid: 0.94, def: 1.03, stamina: 0.7, foul: 0.78 },
  Medium: { mid: 1.0, def: 1.0, stamina: 1.0, foul: 1.0 },
  High: { mid: 1.08, def: 0.95, stamina: 1.55, foul: 1.35 },
};
export const PRESSING_NAMES = Object.keys(PRESSING);

export const POS_GROUP = {
  GK: 'GK',
  RB: 'DF', LB: 'DF', CB: 'DF',
  DM: 'MF', CM: 'MF', AM: 'MF', RM: 'MF', LM: 'MF',
  RW: 'FW', LW: 'FW', ST: 'FW',
};

export const ROLES = {
  GK: ['Goalkeeper', 'Sweeper keeper'],
  DF: ['Full-back', 'Centre-back', 'Wing-back'],
  MF: ['Ball-winner', 'Playmaker', 'Box-to-box'],
  FW: ['Poacher', 'Target forward', 'Inside forward'],
};

export const ROLE_WEIGHTS = {
  Goalkeeper: { gk: 1 },
  'Sweeper keeper': { gk: 0.7, pas: 0.3 },
  'Full-back': { def: 0.4, pac: 0.5, pas: 0.1 },
  'Centre-back': { def: 0.7, pac: 0.15, pas: 0.15 },
  'Wing-back': { def: 0.35, pac: 0.4, pas: 0.25 },
  'Ball-winner': { def: 0.5, pas: 0.2, pac: 0.3 },
  Playmaker: { pas: 0.65, sho: 0.1, def: 0.1, pac: 0.15 },
  'Box-to-box': { pas: 0.3, def: 0.3, pac: 0.25, sho: 0.15 },
  Poacher: { sho: 0.6, pac: 0.35, pas: 0.05 },
  'Target forward': { sho: 0.55, def: 0.15, pas: 0.15, pac: 0.15 },
  'Inside forward': { sho: 0.45, pac: 0.35, pas: 0.2 },
};

export const OVERALL_WEIGHTS = {
  GK: { gk: 0.85, pas: 0.1, def: 0.05 },
  DF: { def: 0.5, pac: 0.2, pas: 0.2, sho: 0.1 },
  MF: { pas: 0.4, def: 0.2, pac: 0.2, sho: 0.2 },
  FW: { sho: 0.5, pac: 0.3, pas: 0.2 },
};

export function defaultRole(pos) {
  const g = POS_GROUP[pos];
  if (g === 'GK') return 'Goalkeeper';
  if (g === 'DF') return pos === 'RB' || pos === 'LB' ? 'Full-back' : 'Centre-back';
  if (g === 'MF') return pos === 'DM' ? 'Ball-winner' : 'Playmaker';
  return pos === 'ST' ? 'Poacher' : 'Inside forward';
}

export function overallOf(attrs, pos) {
  const w = OVERALL_WEIGHTS[POS_GROUP[pos]] || OVERALL_WEIGHTS.MF;
  let v = 0;
  for (const k in w) v += attrs[k] * w[k];
  return Math.round(v);
}

function roleScore(player, role) {
  const w = ROLE_WEIGHTS[role] || { pas: 1 };
  let v = 0;
  for (const k in w) v += player.attrs[k] * w[k];
  return v / 100; // roughly 0.4..0.9
}

// ── Randomness ───────────────────────────────────────────────────────────
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

export function matchSeed(careerSeed, matchday, index) {
  return hash(careerSeed, 'match', matchday, index);
}

function poisson(rng, lambda) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l);
  return k - 1;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function weighted(rng, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0.001, weightOf(it));
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0.001, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// ── Squads ───────────────────────────────────────────────────────────────
const FIRST_NAMES = ['Tomas', 'Dunn', 'Marco', 'Sam', 'Eli', 'Kofi', 'Lee', 'Theo', 'Jonas', 'Pia', 'Ansel', 'Ruben', 'Ismail', 'Noah', 'Hugo', 'Felix', 'Otto', 'Arun', 'Miles', 'Ivan', 'Kai', 'Luca', 'Nico', 'Owen', 'Reece', 'Silas', 'Tariq', 'Umar', 'Victor', 'Yusuf', 'Ade', 'Bram', 'Cato', 'Dario', 'Emeka', 'Finn', 'Gus', 'Hal', 'Ines', 'Jae', 'Kian', 'Levi', 'Milo', 'Nils', 'Osian', 'Pablo', 'Quinn', 'Rory', 'Sven', 'Teo', 'Anders', 'Beto', 'Cyrus', 'Dane', 'Ewan', 'Femi', 'Gil', 'Hadi', 'Idris', 'Jude'];
const LAST_NAMES = ['Brandt', 'Okafor', 'Voss', 'Ruiz', 'Kerr', 'Mensah', 'Ode', 'Bell', 'Ito', 'Lam', 'Hale', 'Pike', 'Grey', 'Lund', 'Fenn', 'Ash', 'Marsh', 'Tate', 'Rowe', 'Wade', 'Ellis', 'Vaughn', 'Nash', 'Cobb', 'Dean', 'Falk', 'Gorse', 'Hobb', 'Ives', 'Jarr', 'Kemp', 'Lunn', 'Moor', 'Nunn', 'Orr', 'Pace', 'Quay', 'Rest', 'Sand', 'Tarn', 'Ull', 'Veil', 'Wren', 'Yeo', 'Zell', 'Bowen', 'Crane', 'Dove', 'Eade', 'Frost', 'Gill', 'Holt', 'Irwin', 'Jett', 'Kerr', 'Lowe', 'Mays', 'Neal', 'Oakes', 'Pryce'];

const SQUAD_SHAPE = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'RB', 'LB',
  'CM', 'CM', 'CM', 'DM', 'AM', 'RM', 'LM',
  'ST', 'ST', 'RW', 'LW',
];

// The club's reputation decides where its players' attributes sit, and each
// division down is three points weaker.
function attrRange(rep, division = 1) {
  const centre = 48 + rep * 5.2 - (division - 1) * 3; // rep 1, Division 1 -> 53
  return { lo: centre - 11, hi: centre + 13 };
}

// Five attribute rolls in a fixed order, then the same position adjustments.
// The draw order is part of a seed: changing it changes every squad.
function rollAttrs(rng, pos, lo, hi) {
  const roll = () => Math.round(lo + rng() * (hi - lo));
  const g = POS_GROUP[pos];
  const attrs = {
    pac: roll(), pas: roll(), sho: roll(), def: roll(), gk: roll(),
  };
  if (g === 'GK') { attrs.gk = Math.min(92, attrs.gk + 9); attrs.sho = Math.max(20, attrs.sho - 18); }
  if (g === 'DF') { attrs.def = Math.min(92, attrs.def + 6); attrs.sho = Math.max(20, attrs.sho - 12); }
  if (g === 'FW') { attrs.sho = Math.min(92, attrs.sho + 7); attrs.def = Math.max(20, attrs.def - 10); }
  return attrs;
}

function makePlayer(rng, pos, rep, n, division) {
  const { lo, hi } = attrRange(rep, division);
  const attrs = rollAttrs(rng, pos, lo, hi);
  const overall = overallOf(attrs, pos);
  return {
    id: 'p' + n,
    name: '',
    pos,
    age: 18 + Math.floor(rng() * 16),
    attrs,
    overall,
    fitness: 78 + Math.floor(rng() * 23),
    morale: 55 + Math.floor(rng() * 40),
    injury: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    yellow: 0,
    red: 0,
    captain: false,
  };
}

export function buildSquad(seed, clubIndex, rep, division = 1) {
  const rng = mulberry32(hash(seed, 'squad', clubIndex));
  const used = new Set();
  const players = SQUAD_SHAPE.map((pos, i) => {
    const p = makePlayer(rng, pos, rep, clubIndex * 100 + i, division);
    let name;
    do {
      name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
    } while (used.has(name));
    used.add(name);
    p.name = name;
    // From the hash, not the squad's rng: one more draw would change every
    // generated squad, name and fixture for a seed.
    p.peak = peakStyleFor(seed, p.id);
    return p;
  });
  // The best outfield player in the middle of the park wears the armband.
  const mids = players.filter((p) => POS_GROUP[p.pos] === 'MF');
  const cap = mids.reduce((a, b) => (b.overall > a.overall ? b : a), mids[0]);
  if (cap) cap.captain = true;
  return players;
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// A double round robin: everyone plays everyone home and away. A division of
// 18 gives 34 matchdays; the ten-club season of a version 1 career gives 18.
export function buildFixtures(seed, clubIds = COASTAL_IDS) {
  const ids = clubIds.slice();
  // Seeded shuffle so a career's league order differs but repeats for a seed.
  const rng = mulberry32(hash(seed, 'fixtures'));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const n = ids.length;
  const round = [];
  const half = n / 2;
  const fixed = ids[0];
  const rest = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const pairs = [{ home: fixed, away: rest[r] }];
    for (let i = 1; i < half; i++) {
      const a = rest[(r + i) % (n - 1)];
      const b = rest[(r - i + (n - 1) * 2) % (n - 1)];
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    round.push(pairs);
  }
  const second = round.map((pairs) => pairs.map((p) => ({ home: p.away, away: p.home })));
  return round.concat(second);
}

// ── Team selection ───────────────────────────────────────────────────────
export function familiarity(pos, slotPos) {
  if (pos === slotPos) return 1;
  const a = POS_GROUP[pos];
  const b = POS_GROUP[slotPos];
  if (!a || !b) return 0.6;
  if (a === b) return 0.9;
  if (a === 'GK' || b === 'GK') return 0.35;
  const dist = Math.abs(['DF', 'MF', 'FW'].indexOf(a) - ['DF', 'MF', 'FW'].indexOf(b));
  return dist === 1 ? 0.7 : 0.55;
}

export function playerValue(player, slotPos, role, tactics) {
  const fam = familiarity(player.pos, slotPos);
  const fit = 0.72 + 0.28 * (player.fitness / 100);
  const mor = 0.95 + 0.1 * (player.morale / 100);
  const rs = role ? roleScore(player, role) : 0.7;
  const roleMul = role ? 0.96 + 0.09 * rs : 1;
  return player.overall * fam * fit * mor * roleMul;
}

// Fill the formation's slots from a pool: players whose own position is in
// the slot's group first, then anyone left, each at their best fit.
function assignSlots(pool, slots, roles) {
  const value = (p, slot) => playerValue(p, slot.pos, roles && roles[p.id]);
  const chosen = new Array(slots.length).fill(null);
  const poolLeft = pool.slice();
  const gkPool = poolLeft.filter((p) => POS_GROUP[p.pos] === 'GK');
  const gk = gkPool.length ? gkPool.reduce((a, b) => (value(b, slots[0]) > value(a, slots[0]) ? b : a)) : null;
  if (gk) {
    chosen[0] = gk;
    poolLeft.splice(poolLeft.indexOf(gk), 1);
  }
  const order = slots.map((_, i) => i).filter((i) => i > 0);
  for (const i of order) {
    const group = POS_GROUP[slots[i].pos];
    const cands = poolLeft.filter((p) => POS_GROUP[p.pos] === group);
    if (!cands.length) continue;
    const best = cands.reduce((a, b) => (value(b, slots[i]) > value(a, slots[i]) ? b : a));
    chosen[i] = best;
    poolLeft.splice(poolLeft.indexOf(best), 1);
  }
  for (const i of order) {
    if (chosen[i] || !poolLeft.length) continue;
    const best = poolLeft.reduce((a, b) => (value(b, slots[i]) > value(a, slots[i]) ? b : a));
    chosen[i] = best;
    poolLeft.splice(poolLeft.indexOf(best), 1);
  }
  if (!chosen[0] && poolLeft.length) chosen[0] = poolLeft[0];
  return chosen;
}

export function autoLineup(players, formation, roles, excludeInjured = true) {
  const slots = FORMATIONS[formation].slots;
  const available = players.filter((p) => !excludeInjured || p.injury <= 0);
  const pool = available.length >= 11 ? available : players.slice();
  return assignSlots(pool, slots, roles).filter(Boolean).map((p) => p.id);
}

// Put a set of eleven players into a formation's slots, keeping the best fit.
export function arrangeLineup(players, lineup, formation) {
  const slots = FORMATIONS[formation].slots;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const pool = lineup.map((id) => byId[id]).filter(Boolean);
  if (pool.length !== slots.length) return lineup.slice(0, slots.length);
  return assignSlots(pool, slots, {}).filter(Boolean).map((p) => p.id);
}

export function fixLineup(state) {
  const squad = state.squads[state.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  const slots = FORMATIONS[state.tactics.formation].slots;
  const used = new Set();
  let rebuilt = false;
  const lineup = (state.lineup || []).slice(0, 11).map((id, i) => {
    const p = byId[id];
    const slot = slots[i] || slots[0];
    if (p && p.injury <= 0 && !used.has(id)) {
      used.add(id);
      return id;
    }
    // Replace an injured or missing starter with the best fit still free.
    const candidates = squad
      .filter((q) => q.injury <= 0 && !used.has(q.id) && (slot.pos !== 'GK' || POS_GROUP[q.pos] === 'GK'))
      .sort((a, b) => playerValue(b, slot.pos, state.roles[b.id]) - playerValue(a, slot.pos, state.roles[a.id]));
    const pick = candidates[0];
    if (pick) { used.add(pick.id); rebuilt = true; return pick.id; }
    return id;
  });
  if (lineup.length < 11 || POS_GROUP[(byId[lineup[0]] || {}).pos] !== 'GK') {
    state.lineup = autoLineup(squad, state.tactics.formation, state.roles);
    return state.lineup;
  }
  if (rebuilt) state.lineup = lineup;
  return state.lineup;
}

// ── Group setup: check and repair ────────────────────────────────────────
// A career's league group must hold its 18 clubs and a full 34-matchday
// fixture list. A saved career that lost part of it (a short club list, a
// truncated fixture list) is rebuilt here, keeping every result already
// played. A whole setup is never touched: a healthy career comes back from
// these functions exactly as it went in.

// The stored group in slot `index` has the shape today's club screen reads:
// its tier and letter match the pyramid's slot, and it holds DIVISION_SIZE
// unique, known club ids. Which clubs they are is the group's own business —
// promotions move clubs between slots at a rollover.
function groupShapeOk(g, index) {
  const want = GROUPS[index];
  if (!want || !g || typeof g !== 'object' || Array.isArray(g)) return false;
  if (g.tier !== want.tier || g.group !== want.group) return false;
  if (!Array.isArray(g.clubIds) || g.clubIds.length !== DIVISION_SIZE) return false;
  const seen = new Set();
  for (const id of g.clubIds) {
    if (!CLUB_BY_ID[id] || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

// A saved squad the match engine can play with.
function squadUsable(squad) {
  return Array.isArray(squad) && squad.length >= SQUAD_MIN && squad.length <= 60
    && squad.every((p) => p && typeof p === 'object'
      && typeof p.id === 'string' && typeof p.name === 'string'
      && POS_GROUP[p.pos] && Number.isInteger(p.overall));
}

// A saved result the league table can count.
function resultUsable(r) {
  return !!r && typeof r === 'object' && !Array.isArray(r)
    && Number.isInteger(r.matchday) && r.matchday >= 1 && r.matchday <= MATCHDAYS
    && !!CLUB_BY_ID[r.home && r.home.id] && !!CLUB_BY_ID[r.away && r.away.id]
    && Number.isInteger(r.homeGoals) && r.homeGoals >= 0
    && Number.isInteger(r.awayGoals) && r.awayGoals >= 0;
}

// Why a career's league setup is not whole, or null when it is. Only a
// three-tier career is checked; careers from before it keep their own
// behaviour. The first failure wins.
export function groupSetupError(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'state';
  if (!(state.version >= 3)) return null;
  if (!CLUB_BY_ID[state.clubId]) return 'club';
  if (!Array.isArray(state.groups) || state.groups.length !== GROUPS.length
    || !state.groups.every((g, i) => groupShapeOk(g, i))) return 'groups';
  const at = state.groupIndex;
  if (!Number.isInteger(at) || at < 0 || at >= state.groups.length) return 'groupIndex';
  const own = state.groups[at];
  if (own.tier !== state.division || own.group !== state.group
    || !own.clubIds.includes(state.clubId)) return 'groupIndex';
  if (!Number.isInteger(state.matchday) || state.matchday < 0
    || state.matchday > MATCHDAYS) return 'matchday';
  const inGroup = new Set(own.clubIds);
  const half = DIVISION_SIZE / 2;
  if (!Array.isArray(state.fixtures) || state.fixtures.length !== MATCHDAYS) return 'fixtures';
  for (const day of state.fixtures) {
    if (!Array.isArray(day) || day.length !== half) return 'fixtures';
    const seen = new Set();
    for (const pair of day) {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair)) return 'fixtures';
      if (!inGroup.has(pair.home) || !inGroup.has(pair.away) || pair.home === pair.away) return 'fixtures';
      if (seen.has(pair.home) || seen.has(pair.away)) return 'fixtures';
      seen.add(pair.home);
      seen.add(pair.away);
    }
    if (seen.size !== DIVISION_SIZE) return 'fixtures';
  }
  if (!Array.isArray(state.results)) return 'results';
  const perDay = new Map();
  for (const r of state.results) {
    if (!resultUsable(r)) return 'results';
    if (!inGroup.has(r.home.id) || !inGroup.has(r.away.id)) return 'membership';
    perDay.set(r.matchday, (perDay.get(r.matchday) || 0) + 1);
  }
  // The played matchdays and the results must agree: a career partway through
  // a season carries a full day's results for every matchday it played, and
  // none beyond it. A matchday claimed with no results behind it is damage
  // the repair replays, not a day the table can show.
  for (let d = 1; d <= MATCHDAYS; d++) {
    const n = perDay.get(d) || 0;
    if (d <= state.matchday ? n !== half : n !== 0) return 'results';
  }
  return null;
}

// Rebuild a broken group setup, keeping every result already played. A state
// that passes groupSetupError comes back as the same object, untouched;
// null means the damage is beyond repair. Everything is deterministic from
// the career's own season seed, so the same saved state always rebuilds the
// same fixtures.
export function repairGroupSetup(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  if (!groupSetupError(state)) return state;
  const seed = seasonSeed(state);

  // Each matchday's pairings, read back from its own results in stored order.
  // A day takes its first half results that do not double-book a club, so a
  // damaged record beyond a full day's worth is simply not chosen.
  const byDay = new Map();
  const chosen = new Set();
  const half = DIVISION_SIZE / 2;
  if (Array.isArray(state.results)) {
    for (const r of state.results) {
      if (!resultUsable(r)) continue;
      if (!byDay.has(r.matchday)) byDay.set(r.matchday, []);
      const day = byDay.get(r.matchday);
      if (day.length < half && !day.some((p) => p.home === r.home.id || p.home === r.away.id
        || p.away === r.home.id || p.away === r.away.id)) {
        day.push({ home: r.home.id, away: r.away.id });
        chosen.add(r);
      }
    }
  }
  // How far the season really went: the last matchday whose results are all
  // there. A day with a record missing replays rather than showing a played
  // matchday with an empty half.
  let played = 0;
  while (played < MATCHDAYS && (byDay.get(played + 1) || []).length === half) played++;
  // The results the rebuilt career keeps, in the order they were saved: the
  // pairings the played days chose, and nothing from a day beyond them. What
  // a damaged day dropped does not come back.
  const results = Array.isArray(state.results)
    ? state.results.filter((r) => chosen.has(r) && r.matchday <= played) : [];

  // Every club the kept history names, the manager's own first: the
  // membership the rebuilt group must hold. More than DIVISION_SIZE of them
  // is damage nothing can absorb.
  const kept = [state.clubId];
  const seen = new Set([state.clubId]);
  for (const r of results) {
    for (const side of [r.home, r.away]) {
      if (!seen.has(side.id)) { seen.add(side.id); kept.push(side.id); }
    }
  }
  if (kept.length > DIVISION_SIZE) return null;

  // Where the club plays: the stored group it sits in when that group is
  // whole and the kept results agree with it; else any whole stored group of
  // its division holding it; else the canonical pyramid slot, which also
  // corrects a division or letter saved wrong.
  const stored = Array.isArray(state.groups) ? state.groups : [];
  const covers = (ids) => kept.every((id) => ids.includes(id));
  const at = Number.isInteger(state.groupIndex) ? state.groupIndex : -1;
  let gi = at >= 0 && at < GROUPS.length && groupShapeOk(stored[at], at)
    && stored[at].clubIds.includes(state.clubId) && covers(stored[at].clubIds) ? at : -1;
  if (gi < 0) {
    gi = stored.findIndex((g, i) => groupShapeOk(g, i) && g.tier === state.division
      && g.clubIds.includes(state.clubId) && covers(g.clubIds));
  }
  let ids;
  if (gi >= 0) {
    ids = stored[gi].clubIds.slice();
  } else {
    gi = clubToGroup[state.clubId] || 0;
    const canonical = GROUPS[gi].clubIds;
    if (covers(canonical)) {
      ids = canonical.slice();
    } else {
      // History first, then the canonical group, then the same tier's other
      // canonical groups, then any known club — never past 18.
      ids = kept.slice();
      for (const id of canonical) {
        if (ids.length >= DIVISION_SIZE) break;
        if (!ids.includes(id)) ids.push(id);
      }
      for (const g of GROUPS) {
        if (ids.length >= DIVISION_SIZE) break;
        if (g.tier !== GROUPS[gi].tier) continue;
        for (const id of g.clubIds) {
          if (ids.length >= DIVISION_SIZE) break;
          if (!ids.includes(id)) ids.push(id);
        }
      }
      for (const id of COASTAL_IDS) {
        if (ids.length >= DIVISION_SIZE) break;
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }

  // The pyramid as it will be saved: this group rebuilt, every other group
  // kept when it is whole, refilled from its canonical slot when it is not.
  const groups = GROUPS.map((g, i) => {
    if (i === gi) return { tier: g.tier, group: g.group, clubIds: ids };
    if (groupShapeOk(stored[i], i)) {
      return { tier: stored[i].tier, group: stored[i].group, clubIds: stored[i].clubIds.slice() };
    }
    return { tier: g.tier, group: g.group, clubIds: g.clubIds.slice() };
  });

  // Every club of the group needs a squad the engine can play with; one
  // missing or malformed is built fresh from the season seed, exactly the
  // squad it was always going to have. Existing squads are untouched.
  const squadsIn = state.squads && typeof state.squads === 'object' && !Array.isArray(state.squads)
    ? state.squads : {};
  const squads = { ...squadsIn };
  const tier = groups[gi].tier;
  for (const id of ids) {
    if (!squadUsable(squads[id])) {
      squads[id] = buildSquad(seed, CLUB_INDEX[id], CLUB_BY_ID[id].rep, tier);
    }
  }
  const rolesIn = state.roles && typeof state.roles === 'object' && !Array.isArray(state.roles)
    ? state.roles : {};
  const roles = { ...rolesIn };
  for (const id of ids) {
    for (const p of squads[id]) {
      if (!roles[p.id]) roles[p.id] = defaultRole(p.pos);
    }
  }

  // The season continues from a fresh schedule that skips the pairings
  // already played.
  let fixtures;
  if (played === 0) {
    fixtures = buildFixtures(seed, ids);
  } else {
    // Only the pairing as it was played is skipped: the reverse leg is the
    // return fixture, still to be played.
    const playedPairs = new Set(results.map((r) => r.home.id + '|' + r.away.id));
    fixtures = [];
    for (let d = 1; d <= played; d++) fixtures.push(byDay.get(d));
    let remaining = buildFixtures(seed, ids).flat()
      .filter((f) => !playedPairs.has(f.home + '|' + f.away));
    while (fixtures.length < MATCHDAYS && remaining.length) {
      const day = []; const left = [];
      for (const f of remaining) {
        const clash = day.some((p) => p.home === f.home || p.home === f.away
          || p.away === f.home || p.away === f.away);
        if (day.length < half && !clash) day.push(f);
        else left.push(f);
      }
      if (!day.length) break;
      fixtures.push(day);
      remaining = left;
    }
    // A tail the pool cannot fill stands empty: it plays no matches and the
    // season still finishes.
    while (fixtures.length < MATCHDAYS) fixtures.push([]);
  }
  // A report of a day the repair dropped describes a match this career no
  // longer counts as played, so it goes with the results it came from.
  const report = state.lastReport;
  const reportKept = !!report && played === state.matchday
    && results.some((r) => r.matchday === report.matchday);
  return { ...state, matchday: played, division: groups[gi].tier, group: groups[gi].group,
    groups, groupIndex: gi, squads, roles, fixtures, results,
    lastReport: reportKept ? report : null };
}

// A career's groups, brought up to today's pyramid. A career saved before
// Division 3 grew to twelve groups keeps all nine of its own groups exactly as
// they are, reshuffled by earlier seasons or not, and gains copies of the
// eight new Division 3 groups, which hold only the 144 new clubs. So every
// saved club stays where it is and no club appears twice.
export function pyramidGroups(state) {
  const stored = state && Array.isArray(state.groups) ? state.groups : [];
  const groups = stored.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
  for (let i = groups.length; i < GROUPS.length; i++) {
    groups.push({ tier: GROUPS[i].tier, group: GROUPS[i].group, clubIds: GROUPS[i].clubIds.slice() });
  }
  return groups;
}

// A career saved by an earlier version of the app, made ready for today's club
// screen: only what is missing or unusable is filled in, from the career's own
// squad. A valid career comes back equal; null means it cannot be shown. It
// never touches the version, the divisions, the season, the seed, the results
// or the squads — except that a broken group setup is rebuilt first, which may
// rewrite the groups and the unplayed fixtures (see repairGroupSetup).
export function repairCareer(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const club = CLUB_BY_ID[state.clubId];
  if (!club) return null;
  if (!Array.isArray(state.results)) return null;
  if (state.version < 3 && !Array.isArray(state.fixtures)) return null;
  // A three-tier career whose group setup is broken is rebuilt here; only
  // damage beyond repair still fails. A whole setup passes through untouched.
  if (state.version >= 3) {
    const settled = repairGroupSetup(state);
    if (!settled) return null;
    state = settled;
  }
  if (!state.squads || !Array.isArray(state.squads[state.clubId])) return null;

  const squad = state.squads[state.clubId];
  const roles = state.roles && typeof state.roles === 'object' && !Array.isArray(state.roles)
    ? state.roles : {};
  const given = state.tactics && typeof state.tactics === 'object' ? state.tactics : {};
  const formation = FORMATION_NAMES.includes(given.formation) ? given.formation : club.formation;
  const tactics = {
    ...given,
    formation,
    mentality: MENTALITY_NAMES.includes(given.mentality) ? given.mentality : 'Balanced',
    pressing: PRESSING_NAMES.includes(given.pressing) ? given.pressing : 'Medium',
  };

  const ids = new Set(squad.map((p) => p && p.id));
  const givenLineup = state.lineup;
  const lineupOk = Array.isArray(givenLineup) && givenLineup.length === 11
    && new Set(givenLineup).size === 11 && givenLineup.every((id) => ids.has(id));
  const lineup = lineupOk ? givenLineup : autoLineup(squad, formation, roles);

  const total = state.fixtures.length;
  let matchday = state.matchday;
  if (!Number.isInteger(matchday) || matchday < 0 || matchday > total) {
    matchday = Number.isInteger(matchday) ? Math.min(Math.max(matchday, 0), total) : 0;
  }

  const report = state.lastReport;
  const reportOk = !!report && typeof report === 'object'
    && report.home && report.home.id
    && report.away && report.away.id
    && report.stats && typeof report.stats === 'object'
    && report.ratings && typeof report.ratings === 'object'
    && Array.isArray(report.moments);

  const out = {
    ...state,
    tactics,
    roles,
    lineup,
    matchday,
    // Today's match times, kept by the server. A career saved before this
    // field existed counts as none played today. The zone is the page's to
    // send: the engine cannot know the manager's clock.
    plays: Array.isArray(state.plays) ? state.plays.filter(isIsoString).slice(-MATCHES_PER_DAY) : [],
    finished: Boolean(state.finished),
    // The server owns the schedule; a career saved before it existed gets one
    // stamped by the server, not invented here.
    lastReport: reportOk ? report : null,
    // A career saved before Club credits, fans or sponsors existed gets them
    // now: credits 0, the division's starting fans and this season's sponsor.
    ...moneyFields(state),
    // A career saved before facilities existed has every one at level 1.
    facilities: facilityLevels(state),
    // Staff, and the academy's prospects, for a career saved before them.
    staff: staffFields(state),
    youth: youthFields(state),
  };
  // A three-tier career saved before Division 3 grew keeps its groups and
  // gains the new ones.
  if (state.version >= 3) out.groups = pyramidGroups(state);
  if (typeof state.nextMatchAt === 'string' && !Number.isNaN(Date.parse(state.nextMatchAt))) {
    out.nextMatchAt = state.nextMatchAt;
  } else if (state.nextMatchAt === null) {
    out.nextMatchAt = null;
  } else {
    delete out.nextMatchAt;
  }
  return out;
}

// ── Validation ───────────────────────────────────────────────────────────
export function validateLineup(state) {
  const squad = state.squads[state.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  if (!state.lineup || state.lineup.length !== 11) {
    return { ok: false, message: 'Pick eleven starters before you play.' };
  }
  if (new Set(state.lineup).size !== 11) {
    return { ok: false, message: 'The same player is in the lineup twice. Pick eleven different players.' };
  }
  for (const id of state.lineup) {
    if (!byId[id]) return { ok: false, message: 'A starter is no longer in your squad. Pick eleven starters again.' };
  }
  const injured = state.lineup.filter((id) => byId[id].injury > 0);
  if (injured.length) {
    const names = injured.map((id) => byId[id].name);
    return { ok: false, message: 'Injured: ' + names.join(', ') + '. Bring a fit player on in their place.' };
  }
  const slots = FORMATIONS[state.tactics.formation].slots;
  const gkId = state.lineup[0];
  if (POS_GROUP[byId[gkId].pos] !== 'GK') {
    return { ok: false, message: 'Your eleven needs a goalkeeper in goal. Pick one in the goalkeeper slot.' };
  }
  const otherGk = state.lineup.filter((id) => POS_GROUP[byId[id].pos] === 'GK' && id !== gkId);
  if (otherGk.length && slots[0].pos !== 'GK') {
    return { ok: false, message: 'Your eleven needs a goalkeeper in goal.' };
  }
  return { ok: true, message: '' };
}

// ── Club form, table, fixtures ───────────────────────────────────────────
export function allResults(state) {
  return state.results || [];
}

// The 18 clubs of the manager's group. A version 2 career keeps the flat
// divisions it was saved in; a version 1 career is the old ten-club season.
export function divisionClubIds(state) {
  if (state && state.version >= 3 && Array.isArray(state.groups)
    && state.groups[state.groupIndex] && Array.isArray(state.groups[state.groupIndex].clubIds)) {
    return state.groups[state.groupIndex].clubIds;
  }
  if (state && state.version >= 2 && Array.isArray(state.divisions) && state.divisions[state.division - 1]) {
    return state.divisions[state.division - 1];
  }
  return COASTAL_IDS;
}

// What a career's place is called: "Division 2 Group B", "Division 1", or the
// old ten-club league's name.
export function placeName(state) {
  if (state && state.version >= 3 && Array.isArray(state.groups) && state.groups[state.groupIndex]) {
    return groupName(state.division, state.group);
  }
  if (state && state.version >= 2 && Array.isArray(state.divisions)) return 'Division ' + state.division;
  return LEAGUE_NAME;
}

// The seed a season's matches and squads come from. Season 1 is the career
// seed itself, so a version 1 career's matches stay exactly as they were.
export function seasonSeed(state) {
  const season = state.season || 1;
  return season <= 1 ? state.seed : hash(state.seed, 'season', season);
}

export function leagueTable(state) {
  const rows = {};
  for (const id of divisionClubIds(state)) {
    const c = CLUB_BY_ID[id];
    rows[c.id] = { id: c.id, name: c.name, short: c.short, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  }
  for (const r of state.results) {
    const h = rows[r.home.id];
    const a = rows[r.away.id];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += r.homeGoals; h.ga += r.awayGoals;
    a.gf += r.awayGoals; a.ga += r.homeGoals;
    if (r.homeGoals > r.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (r.homeGoals < r.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const list = Object.values(rows);
  for (const r of list) r.gd = r.gf - r.ga;
  list.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
  list.forEach((r, i) => { r.rank = i + 1; });
  return list;
}

// The ten players in the group who have scored most this season. Season goals
// live on each player in `state.squads`, so nothing extra is stored. Ties go
// to the name, and a player on no goals is left out.
export function topScorers(state, limit = 10) {
  const out = [];
  if (!state) return out;
  const squads = state.squads || {};
  for (const id of divisionClubIds(state)) {
    const club = CLUB_BY_ID[id];
    if (!club) continue;
    for (const p of squads[id] || []) {
      const goals = Number(p && p.goals);
      if (!(goals > 0)) continue;
      out.push({ id: p.id, name: p.name, pos: p.pos, clubId: id, clubName: club.name, goals });
    }
  }
  out.sort((a, b) => b.goals - a.goals || String(a.name).localeCompare(String(b.name)));
  return out.slice(0, limit);
}

export function formOf(state, clubId, count = 5) {
  const played = [];
  for (const r of state.results) {
    if (r.home.id === clubId) played.push(r.homeGoals > r.awayGoals ? 'W' : r.homeGoals < r.awayGoals ? 'L' : 'D');
    else if (r.away.id === clubId) played.push(r.awayGoals > r.homeGoals ? 'W' : r.awayGoals < r.homeGoals ? 'L' : 'D');
  }
  return played.slice(-count);
}

export function nextFixture(state) {
  if (state.matchday >= state.fixtures.length) return null;
  const fixtures = state.fixtures[state.matchday];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (f.home === state.clubId || f.away === state.clubId) {
      const home = f.home === state.clubId;
      return {
        index: i,
        home: f.home,
        away: f.away,
        venue: home ? 'Home' : 'Away',
        opponentId: home ? f.away : f.home,
        matchday: state.matchday + 1,
      };
    }
  }
  return null;
}

// `size` is the number of clubs in the division the rank is in.
export function objectiveMet(rank, objective, size = DIVISION_SIZE) {
  if (objective === 'Win the league') return rank === 1;
  if (objective === 'Finish in the top half') return rank <= Math.ceil(size / 2);
  if (objective === 'Avoid finishing bottom') return rank < size;
  return rank <= Math.ceil(size / 2) - 1;
}

// ── Preparing a side for the simulation ──────────────────────────────────
function lineupUsable(squad, lineup) {
  if (!Array.isArray(lineup) || lineup.length !== 11 || new Set(lineup).size !== 11) return false;
  const ids = new Set((squad || []).map((p) => p.id));
  return lineup.every((id) => ids.has(id));
}

function teamFor(state, clubId, managers) {
  const club = CLUB_BY_ID[clubId];
  const squad = state.squads[clubId];
  const isUser = clubId === state.clubId;
  const managed = managers && managers[clubId];
  if (!isUser && managed) {
    const tactics = managed.tactics && FORMATIONS[managed.tactics.formation]
      ? {
        formation: managed.tactics.formation,
        mentality: MENTALITIES[managed.tactics.mentality] ? managed.tactics.mentality : 'Balanced',
        pressing: PRESSING[managed.tactics.pressing] ? managed.tactics.pressing : 'Medium',
      }
      : { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' };
    const roles = managed.roles && typeof managed.roles === 'object' ? managed.roles : {};
    const lineup = lineupUsable(squad, managed.lineup)
      ? managed.lineup.slice()
      : autoLineup(squad, tactics.formation, roles);
    return { club, squad, lineup, tactics, roles };
  }
  const tactics = isUser ? state.tactics : { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' };
  const roles = isUser ? state.roles || {} : {};
  const lineup = isUser ? state.lineup : autoLineup(squad, tactics.formation, roles);
  return { club, squad, lineup, tactics, roles };
}

function sidePower(team) {
  const byId = Object.fromEntries(team.squad.map((p) => [p.id, p]));
  const slots = FORMATIONS[team.tactics.formation].slots;
  let att = 0; let mid = 0; let def = 0;
  const starters = [];
  team.lineup.forEach((id, i) => {
    const p = byId[id];
    const slot = slots[i] || slots[slots.length - 1];
    if (!p) return;
    const role = team.roles[id];
    const v = playerValue(p, slot.pos, role);
    starters.push({ player: p, slot, v });
    const g = POS_GROUP[slot.pos];
    if (g === 'GK') def += v * 1.4;
    else if (g === 'DF') def += v;
    else if (g === 'MF') mid += v;
    else att += v;
  });
  const f = FORMATIONS[team.tactics.formation];
  const m = MENTALITIES[team.tactics.mentality] || MENTALITIES.Balanced;
  const pr = PRESSING[team.tactics.pressing] || PRESSING.Medium;
  att = (att / 3) * f.att * m.att;
  mid = (mid / 3.4) * f.mid * m.mid * pr.mid;
  def = (def / 5.4) * f.def * m.def;
  return { att, mid, def, starters, press: pr, mentality: m };
}

// ── The match ────────────────────────────────────────────────────────────
// home/away: { club, squad, lineup, tactics, roles }. Returns a report and the
// effects on each player (fitness, injuries, goals, cards) for the caller to
// apply to the saved state.
export function simulateMatch(home, away, seed) {
  const rng = mulberry32(seed >>> 0);
  const h = sidePower(home);
  const a = sidePower(away);
  const homeAdv = 1.06;

  const hAtt = h.att * homeAdv;
  const aAtt = a.att;
  const hDef = h.def * 1.02;

  const hLambda = Math.max(0.22, Math.min(4.6, 1.38 * Math.pow(hAtt / Math.max(1, a.def), 1.7)));
  const aLambda = Math.max(0.18, Math.min(4.2, 1.26 * Math.pow(aAtt / Math.max(1, hDef), 1.7)));

  const homeGoals = Math.min(7, poisson(rng, hLambda));
  const awayGoals = Math.min(7, poisson(rng, aLambda));

  // Possession from the midfield battle.
  const hMid = h.mid + hAtt * 0.25;
  const aMid = a.mid + aAtt * 0.25;
  let share = hMid / (hMid + aMid);
  share = Math.max(0.3, Math.min(0.7, share + (rng() - 0.5) * 0.06));
  const poss = [Math.round(share * 100), 100 - Math.round(share * 100)];

  const sides = {
    home: { team: home, power: h, goals: homeGoals, att: hAtt, def: a.def, label: home.club.name },
    away: { team: away, power: a, goals: awayGoals, att: aAtt, def: hDef, label: away.club.name },
  };

  // Who is on the pitch for each side, and who is on the bench.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const byId = Object.fromEntries(s.team.squad.map((p) => [p.id, p]));
    s.onPitch = s.team.lineup.map((id, i) => ({
      player: byId[id],
      slot: FORMATIONS[s.team.tactics.formation].slots[i],
      minutes: 0,
      on: 0,
      off: null,
    })).filter((x) => x.player);
    const ids = new Set(s.team.lineup);
    s.bench = s.team.squad.filter((p) => !ids.has(p.id) && p.injury <= 0);
    s.subs = 0;
    s.effects = {};
    s.goalsScored = [];
    s.cards = { yellow: 0, red: 0 };
    s.fouls = 0;
  }

  const moments = [];

  function ensureEffect(s, player) {
    if (!s.effects[player.id]) {
      s.effects[player.id] = { goals: 0, assists: 0, yellow: 0, red: 0, injury: 0, minutes: 0, fitness: 0, started: false, subOn: null, subOff: null };
    }
    return s.effects[player.id];
  }
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const entry of s.onPitch) {
      const e = ensureEffect(s, entry.player);
      e.started = true;
    }
  }

  // Goal times, then everything else.
  const goalEvents = [];
  for (const key of ['home', 'away']) {
    for (let i = 0; i < sides[key].goals; i++) {
      goalEvents.push({ minute: 2 + Math.floor(rng() * 88), side: key });
    }
  }
  goalEvents.sort((x, y) => x.minute - y.minute);

  // Shots: every goal is a shot on target, plus the misses.
  const shots = {};
  const onTarget = {};
  for (const key of ['home', 'away']) {
    const g = sides[key].goals;
    const attempts = Math.min(30, g + poisson(rng, key === 'home' ? 9.6 : 8.4));
    const accurate = Math.min(attempts, g + poisson(rng, key === 'home' ? 3.6 : 3.0));
    shots[key] = attempts;
    onTarget[key] = accurate;
  }

  // Injuries and substitutions, in the last third of the match.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const injuryRng = rng;
    if (injuryRng() < 0.3) {
      const healthy = s.onPitch.filter((e) => !e.off);
      const injuredEntry = healthy.length ? pick(rng, healthy) : null;
      if (injuredEntry) {
        const se = ensureEffect(s, injuredEntry.player);
        const weeks = 1 + Math.floor(rng() * 3);
        se.injury = weeks;
        const minute = 10 + Math.floor(rng() * 70);
        injuredEntry.off = minute;
        se.subOff = minute;
        moments.push({ minute, type: 'injury', side: key, playerId: injuredEntry.player.id, playerName: injuredEntry.player.name, detail: 'Injured, out for ' + weeks + (weeks === 1 ? ' match' : ' matches'), teamName: s.team.club.name });
        // An injured player comes off straight away when there is a bench.
        if (s.subs < 3 && s.bench.length) {
          let best = null;
          let bestV = -1;
          for (const p of s.bench) {
            const v = playerValue(p, injuredEntry.slot.pos, s.team.roles[p.id]);
            if (v > bestV) { bestV = v; best = p; }
          }
          if (best) {
            s.bench = s.bench.filter((p) => p !== best);
            s.onPitch.push({ player: best, slot: injuredEntry.slot, minutes: 0, on: minute, off: null });
            const seIn = ensureEffect(s, best);
            seIn.subOn = minute;
            s.subs++;
            moments.push({ minute, type: 'sub', side: key, playerId: best.id, playerName: best.name, playerOutName: injuredEntry.player.name, detail: 'Injured, replaced', teamName: s.team.club.name });
          }
        }
      }
    }
    // Up to three substitutions, made when a starter is tiring or injured.
    const subMinutes = [58, 67, 76, 84];
    for (const m of subMinutes) {
      if (s.subs >= 3) break;
      if (rng() > 0.62) continue;
      const tired = s.onPitch.filter((e) => !e.off && e.player.fitness - m * 0.28 * s.power.press.stamina < 52);
      const out = tired.sort((x, y) => x.player.fitness - y.player.fitness)[0];
      if (!out) continue;
      // A bench player who fits the vacated slot best.
      let best = null;
      let bestV = -1;
      for (const p of s.bench) {
        if (s.onPitch.some((e) => e.player.id === p.id)) continue;
        const v = playerValue(p, out.slot.pos, s.team.roles[p.id]);
        if (v > bestV) { bestV = v; best = p; }
      }
      if (!best) continue;
      s.bench = s.bench.filter((p) => p !== best);
      const seOut = ensureEffect(s, out.player);
      seOut.subOff = m;
      out.off = m;
      const onEntry = { player: best, slot: out.slot, minutes: 0, on: m, off: null };
      s.onPitch.push(onEntry);
      const seIn = ensureEffect(s, best);
      seIn.subOn = m;
      s.subs++;
      const outFit = Math.max(12, Math.round(out.player.fitness - m * 0.28 * s.power.press.stamina));
      moments.push({
        minute: m,
        type: 'sub',
        side: key,
        playerId: best.id,
        playerName: best.name,
        playerOutName: out.player.name,
        detail: out.player.name + ' tired, fitness ' + outFit + '%',
        teamName: s.team.club.name,
      });
    }
  }

  // Fouls and cards.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const lambda = 10.4 * s.power.press.foul;
    const fouls = Math.min(26, poisson(rng, lambda));
    s.fouls = fouls;
    for (let i = 0; i < fouls; i++) {
      const chance = 0.115 * (key === 'away' ? 1.06 : 1);
      if (rng() < chance) {
        const cardMinute = 5 + Math.floor(rng() * 85);
        const candidates = s.onPitch.filter((e) => e.on <= cardMinute && (!e.off || e.off > cardMinute) && (POS_GROUP[e.slot.pos] !== 'GK' || rng() < 0.1));
        const offender = weighted(rng, candidates, (e) => 0.5 + e.player.attrs.def / 150);
        const se = ensureEffect(s, offender.player);
        const straight = rng() < 0.004;
        if (straight) {
          se.red++;
          s.cards.red++;
          moments.push({ minute: cardMinute, type: 'red', side: key, playerId: offender.player.id, playerName: offender.player.name, detail: 'Straight red card', teamName: s.team.club.name });
        } else {
          se.yellow++;
          s.cards.yellow++;
          moments.push({ minute: cardMinute, type: 'yellow', side: key, playerId: offender.player.id, playerName: offender.player.name, detail: 'Foul on ' + pick(rng, sides[key === 'home' ? 'away' : 'home'].onPitch).player.name, teamName: s.team.club.name });
        }
      }
    }
    // A second yellow is a red.
  }
  // Any player with two yellows is off.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const id in s.effects) {
      const e = s.effects[id];
      if (e.yellow >= 2 && e.red === 0) {
        e.red = 1;
        s.cards.red++;
        const entry = s.onPitch.find((x) => x.player.id === id);
        if (entry) entry.off = 80;
        const yms = moments.filter((m) => m.type === 'yellow' && m.playerId === id);
        const lastY = yms[yms.length - 1];
        moments.push({ minute: lastY ? lastY.minute : 80, type: 'red', side: key, playerId: id, playerName: entry ? entry.player.name : '', detail: 'Second yellow card', teamName: s.team.club.name });
      }
      if (e.red) {
        const entry = s.onPitch.find((x) => x.player.id === id);
        if (entry) entry.off = 80;
      }
    }
  }

  // Goals and their makers.
  for (const ev of goalEvents) {
    const s = sides[ev.side];
    const outfield = s.onPitch.filter((e) => e.on <= ev.minute && (!e.off || e.off > ev.minute) && POS_GROUP[e.slot.pos] !== 'GK');
    const scorer = weighted(rng, outfield, (e) => {
      const p = e.player;
      const g = POS_GROUP[e.slot.pos];
      const posW = g === 'FW' ? 3 : g === 'MF' ? 1.2 : 0.35;
      return posW * (0.5 + p.attrs.sho / 100) * (0.8 + e.player.fitness / 250);
    });
    const mates = outfield.filter((e) => e !== scorer);
    const hasAssist = rng() < 0.74;
    const assist = hasAssist ? weighted(rng, mates, (e) => 0.4 + e.player.attrs.pas / 100) : null;
    const se = ensureEffect(s, scorer.player);
    se.goals++;
    if (assist) ensureEffect(s, assist.player).assists++;
    moments.push({
      minute: ev.minute,
      type: 'goal',
      side: ev.side,
      playerId: scorer.player.id,
      playerName: scorer.player.name,
      assistName: assist ? assist.player.name : null,
      teamName: s.team.club.name,
    });
  }

  moments.sort((x, y) => x.minute - y.minute || (x.type === 'goal' ? -1 : 0));

  // Minutes played and fitness drain.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const id in s.effects) {
      const e = s.effects[id];
      const entry = s.onPitch.find((x) => x.player.id === id);
      const start = e.started ? 0 : (e.subOn || 0);
      const end = e.subOff || (e.red ? 70 : 90);
      e.minutes = Math.max(0, end - start);
    }
  }

  // Ratings for the user's side, and stats for the report.
  const ratingsFor = (s) => {
    const out = {};
    const conceded = s === sides.home ? sides.away.goals : sides.home.goals;
    const result = s.goals - conceded;
    for (const id in s.effects) {
      const e = s.effects[id];
      if (!e.minutes) continue;
      const entry = s.onPitch.find((x) => x.player.id === id);
      const pos = entry ? POS_GROUP[entry.slot.pos] : 'MF';
      let r = 6.1 + e.goals * 1.15 + e.assists * 0.65;
      r += result > 0 ? 0.3 : result < 0 ? -0.25 : 0;
      if (pos === 'GK' || pos === 'DF') r += conceded === 0 ? 0.55 : 0;
      if (pos === 'GK') r += 0.15;
      r -= e.yellow * 0.3 + e.red * 1.4;
      if (e.injury) r -= 0.3;
      out[id] = Math.round(Math.max(3, Math.min(9.8, r)) * 10) / 10;
    }
    return out;
  };

  const report = {
    matchday: null,
    home: { id: home.club.id, name: home.club.name, short: home.club.short },
    away: { id: away.club.id, name: away.club.name, short: away.club.short },
    homeGoals,
    awayGoals,
    moments,
    stats: {
      possession: poss,
      shots: [shots.home, shots.away],
      onTarget: [onTarget.home, onTarget.away],
      passes: [Math.round(poss[0] * 5.6), Math.round(poss[1] * 5.4)],
      fouls: [sides.home.fouls, sides.away.fouls],
      yellow: [sides.home.cards.yellow, sides.away.cards.yellow],
      red: [sides.home.cards.red, sides.away.cards.red],
    },
    ratings: { home: ratingsFor(sides.home), away: ratingsFor(sides.away) },
    effects: { home: sides.home.effects, away: sides.away.effects },
  };
  return report;
}

// ── Applying a match to the career ───────────────────────────────────────
export function applyReport(state, report) {
  const sides = { home: report.home.id, away: report.away.id };
  for (const key of ['home', 'away']) {
    const clubId = sides[key];
    const squad = state.squads[clubId];
    const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
    const effects = report.effects[key];
    const gf = key === 'home' ? report.homeGoals : report.awayGoals;
    const ga = key === 'home' ? report.awayGoals : report.homeGoals;
    const result = gf > ga ? 1 : gf < ga ? -1 : 0;
    const tacticalPress = key === 'home' || clubId === state.clubId
      ? (PRESSING[(clubId === state.clubId ? state.tactics : { pressing: 'Medium' }).pressing] || PRESSING.Medium).stamina
      : 1;
    for (const p of squad) {
      const e = effects[p.id];
      if (e) {
        p.apps++;
        p.goals += e.goals;
        p.assists += e.assists;
        p.yellow += e.yellow;
        p.red += e.red;
        p.fitness = Math.round(Math.max(30, Math.min(100, p.fitness - e.minutes * 0.19 * tacticalPress + 15)));
        if (e.injury) p.injury = Math.max(p.injury, e.injury);
        p.morale = Math.round(Math.max(20, Math.min(100, p.morale + (result > 0 ? 5 : result < 0 ? -5 : 1))));
        p.lastRating = report.ratings[key][p.id] || null;
        p.lastMinutes = e.minutes;
      } else {
        // Rested players recover.
        p.fitness = Math.round(Math.min(100, p.fitness + 15));
        if (p.injury > 0) p.injury = Math.max(0, p.injury - 1);
        p.morale = Math.round(Math.min(100, Math.max(20, p.morale + 1)));
      }
    }
  }
  // Keep the user's eleven fit where injuries took a starter out.
  if (state.clubId === report.home.id || state.clubId === report.away.id) fixLineup(state);
}

// Settle one club's matchday: result credits, home gate and sales, upkeep,
// maintenance and wages, fans, the finance history and the academy. Shared by
// the solo career (its own fixture) and the shared league (all 18 clubs).
export function settleClubMatch(state, own, md) {
    const atHome = own.home.id === state.clubId;
    const goalsFor = atHome ? own.homeGoals : own.awayGoals;
    const goalsAgainst = atHome ? own.awayGoals : own.homeGoals;
    const tier = clubTier(state);
    const fanCap = FAN_CAP[tier] || FAN_CAP[3];
    const m = moneyFields(state);
    const result = creditsForResult(goalsFor, goalsAgainst);
    const seats = stadiumSeats(state);
    const attendance = atHome ? homeCrowd(state, m.fans, fanCap).attendance : 0;
    const gate = attendance * TICKET_PRICE;
    const sales = matchdaySales(state, attendance);
    const levels = facilityLevels(state);
    let left = m.credits + result + gate + sales.shop + sales.food + sales.hotel;
    const pay = (due) => { const paid = Math.min(due, left); left -= paid; return paid; };
    const upkeep = pay(GROUND_UPKEEP);
    const maintenanceDueNow = maintenanceDue(state);
    const maintenance = pay(maintenanceDueNow);
    const wagesDue = wageBill(state);
    const wages = pay(wagesDue);
    const staffDue = staffWagesDue(state);
    const staffWages = pay(staffDue);
    state.credits = left;
    state.fans = fanChange(m.fans, goalsFor, goalsAgainst, fanCap);
    state.sponsor = m.sponsor;
    state.lastSponsor = m.lastSponsor;
    state.finance = {
      ...m.finance,
      gate: m.finance.gate + gate,
      upkeep: m.finance.upkeep + upkeep,
      maintenance: m.finance.maintenance + maintenance,
      wages: m.finance.wages + wages,
      staffWages: m.finance.staffWages + staffWages,
      shop: m.finance.shop + sales.shop,
      food: m.finance.food + sales.food,
      hotel: m.finance.hotel + sales.hotel,
      homeGames: m.finance.homeGames + (atHome ? 1 : 0),
    };
    own.finance = {
      venue: atHome ? 'Home' : 'Away',
      result: goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw',
      attendance,
      price: TICKET_PRICE,
      gate,
      seats,
      fanCap,
      shop: sales.shop,
      food: sales.food,
      hotel: sales.hotel,
      levels: { shop: levels.shop, food: levels.food, hotel: levels.hotel },
      salesRates: {
        shop: MATCHDAY_SALES.shop[levels.shop - 1],
        food: MATCHDAY_SALES.food[levels.food - 1],
        hotel: MATCHDAY_SALES.hotel[levels.hotel - 1],
      },
      upkeep,
      upkeepDue: GROUND_UPKEEP,
      maintenance,
      maintenanceDue: maintenanceDueNow,
      wages,
      wagesDue,
      staffWages,
      staffDue,
      net: result + gate + sales.shop + sales.food + sales.hotel
        - upkeep - maintenance - wages - staffWages,
      balanceAfter: state.credits,
      fansBefore: m.fans,
      fansAfter: state.fans,
    };
    // The Finance tab's matchday history: this matchday's Club credits in and
    // out, newest first, up to the last ten of the season.
    state.financeHistory = [{
      season: state.season || 1,
      matchday: md + 1,
      venue: atHome ? 'Home' : 'Away',
      opponentId: atHome ? own.away.id : own.home.id,
      income: { result, gate, shop: sales.shop, food: sales.food, hotel: sales.hotel },
      expenses: { upkeep, maintenance, wages, staffWages },
      net: own.finance.net,
      balanceAfter: state.credits,
    }, ...m.financeHistory].slice(0, FINANCE_HISTORY_MAX);
    // The academy takes in young players after every matchday.
    academyIntake(state, md + 1);
}

export function playMatchday(state) {
  const md = state.matchday;
  if (md >= state.fixtures.length) return [];
  const reports = [];
  state.fixtures[md].forEach((f, i) => {
    const home = teamFor(state, f.home);
    const away = teamFor(state, f.away);
    const report = simulateMatch(home, away, matchSeed(seasonSeed(state), md, i));
    report.matchday = md + 1;
    report.fixtureIndex = i;
    reports.push(report);
  });
  for (const report of reports) applyReport(state, report);
  for (const r of reports) {
    state.results.push({
      matchday: r.matchday,
      home: r.home,
      away: r.away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
    });
  }
  const own = reports.find((r) => r.home.id === state.clubId || r.away.id === state.clubId) || null;
  state.lastReport = own;
  // Only the manager's own fixture earns or pays Club credits, from the
  // manager's side: the result, the home gate and what the home crowd spends
  // at the shop, food stand and hotel, less ground upkeep, maintenance, player
  // wages and staff wages, each paid only as far as the balance reaches.
  if (own) settleClubMatch(state, own, md);
  state.matchday = md + 1;
  state.finished = state.matchday >= state.fixtures.length;
  return reports;
}

// ── The match schedule ───────────────────────────────────────────────────
// Four matchdays a day, every six hours, open on the manager's own clock. The
// server plays every slot that has passed since the career's nextMatchAt, so
// no button is pressed. Times are wall-clock times in the career's saved IANA
// zone, so 6 am stays 6 am through a daylight-saving change. Nothing here
// reads the clock itself: `now` and `zone` are arguments.
export const MATCH_SLOTS = [0, 6, 12, 18];
export const MATCHES_PER_DAY = 4;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoString(value) {
  return typeof value === 'string' && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

export function validTimeZone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch (_) {
    return false;
  }
}

// The wall clock in `zone`: the local day as YYYY-MM-DD, and the hour and
// minute (h23, so midnight is 0). An unusable zone reads as UTC.
export function localClock(date, zone) {
  const tz = validTimeZone(zone) ? zone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value;
  return {
    day: get('year') + '-' + get('month') + '-' + get('day'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

// '12 am', '6 am', '12 pm', '6 pm'.
export function slotLabel(hour) {
  if (hour === 0) return '12 am';
  if (hour < 12) return hour + ' am';
  if (hour === 12) return '12 pm';
  return (hour - 12) + ' pm';
}

// How far `zone` is ahead of UTC at `date`, in milliseconds.
function zoneOffset(date, zone) {
  const tz = validTimeZone(zone) ? zone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number((parts.find((p) => p.type === type) || {}).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// A wall-clock time on a local day, as the UTC instant it happens at. The
// offset is looked up at that instant, so a daylight-saving change is kept.
function wallClock(day, hour, zone) {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, hour, 0, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const next = target - zoneOffset(new Date(guess), zone);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}

function slotOnDay(day, zone) {
  return MATCH_SLOTS.map((hour) => wallClock(day, hour, zone));
}

// The first kick-off strictly after `instant`.
export function slotAfter(instant, zone) {
  const at = instant instanceof Date ? instant : new Date(instant);
  const day = localClock(at, zone).day;
  for (const slot of slotOnDay(day, zone)) if (slot.getTime() > at.getTime()) return slot;
  return slotOnDay(addDays(day, 1), zone)[0];
}

// 12 am local on `now`'s local day.
export function firstSlotOfDay(now, zone) {
  const at = now instanceof Date ? now : new Date(now);
  return wallClock(localClock(at, zone).day, MATCH_SLOTS[0], zone);
}

// `count` kick-offs in a row, starting with `fromIso`.
export function upcomingSlots(fromIso, count, zone) {
  const out = [];
  let at = fromIso ? new Date(fromIso) : null;
  for (let i = 0; i < count && at && !Number.isNaN(at.getTime()); i++) {
    out.push(at);
    at = slotAfter(at, zone);
  }
  return out;
}

// Play every kick-off that has fallen due, with the lineup and tactics saved
// at the time. A lineup that cannot be used is replaced by the best eleven the
// club can field, so no match is skipped. Returns how many were played.
export function playDueMatches(state, now, zone) {
  const at = now instanceof Date ? now : new Date(now);
  let played = 0;
  while (!state.finished && state.nextMatchAt && Date.parse(state.nextMatchAt) <= at.getTime()) {
    const slot = new Date(state.nextMatchAt);
    if (!validateLineup(state).ok) {
      state.lineup = autoLineup(state.squads[state.clubId], state.tactics.formation, state.roles);
      fixLineup(state);
    }
    playMatchday(state);
    state.plays = (Array.isArray(state.plays) ? state.plays : []).concat(slot.toISOString()).slice(-MATCHES_PER_DAY);
    state.nextMatchAt = state.finished ? null : slotAfter(slot, zone).toISOString();
    played++;
  }
  if (state.finished && state.nextMatchAt) state.nextMatchAt = null;
  return played;
}

// ── The matchday history ─────────────────────────────────────────────────
// The Competition tab's history of the matchdays already played. The career
// stores each fixture's score, so the scores, results and Club credits are
// exact; the minute-by-minute detail (goals, cards, injuries) is only kept
// for the most recent matchday, so older matchdays are re-simulated here with
// the same deterministic engine that played them. Nothing is stored: the
// replay runs on a throwaway copy of the squads each time.

// The slot immediately before a kick-off: the greatest MATCH_SLOTS wall-clock
// instant strictly before `instant` in `zone`. The inverse of slotAfter, used
// to walk the kick-off chain backwards from the career's next match.
export function previousSlot(instant, zone) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  const clock = localClock(at, zone);
  for (let i = MATCH_SLOTS.length - 1; i >= 0; i--) {
    const hour = MATCH_SLOTS[i];
    if (hour >= clock.hour) continue;
    const t = wallClock(clock.day, hour, zone);
    if (t.getTime() < at.getTime()) return t;
  }
  const t = wallClock(addDays(clock.day, -1), MATCH_SLOTS[MATCH_SLOTS.length - 1], zone);
  return t.getTime() < at.getTime() ? t : null;
}

// The kick-off instant of each played matchday, 1-based order. The career
// keeps only the last few instants (`plays`) and its next kick-off, so older
// ones are walked back from there. A stored `plays` instant is the truth for
// its matchday and anchors the walk behind it.
function kickoffChain(state, zone, count) {
  const out = new Array(count).fill(null);
  const plays = (Array.isArray(state.plays) ? state.plays : []).filter(isIsoString);
  const known = Math.min(plays.length, count);
  for (let i = 0; i < known; i++) out[count - known + i] = plays[plays.length - known + i];
  let cursor = isIsoString(state.nextMatchAt) ? new Date(state.nextMatchAt) : null;
  if (!cursor && out[count - 1]) cursor = new Date(out[count - 1]);
  for (let md = count; md >= 1; md--) {
    if (out[md - 1]) { cursor = new Date(out[md - 1]); continue; }
    if (!cursor) break;
    const prev = previousSlot(cursor, zone);
    if (!prev) break;
    out[md - 1] = prev.toISOString();
    cursor = prev;
  }
  return out;
}

// Every played matchday of this season, replayed. The squads go back to how
// the season began — season 1 rebuilds them from the career's seed with
// buildSquad, later seasons reset the stored squads to the rollover's fresh
// fitness and no injuries, because attributes only change at the rollover —
// and then each matchday's nine fixtures are simulated with the same
// per-match seeds playMatchday used, applying each report so the squads
// evolve exactly as they did. Money, fans, the academy and the sponsor are
// left alone: only the reports are wanted. The replay is exact while the
// manager's current team sheet is the one every matchday was played with;
// matchdayHistory reconciles each replayed scoreline against the stored one,
// so a drifted matchday is never shown with events that contradict it.
export function seasonReplay(state) {
  if (!state || !Array.isArray(state.fixtures)) return [];
  const count = Math.min(state.matchday || 0, Array.isArray(state.results) ? state.results.length : 0);
  const reports = new Array(count).fill(null);
  if (count <= 0) return reports;
  const seed = seasonSeed(state);
  const division = state.division || 1;
  const rs = {
    clubId: state.clubId,
    tactics: state.tactics,
    roles: state.roles || {},
    squads: {},
    lineup: [],
  };
  for (const id of Object.keys(state.squads || {})) {
    rs.squads[id] = (state.squads[id] || []).map((p) => ({ ...p, fitness: 100, injury: 0 }));
  }
  // Squads the seed can rebuild exactly are rebuilt: season 1's every club
  // (buildSquad is deterministic, right down to the starting fitness), and in
  // later seasons the bot clubs, whose squads the rollover built the same way.
  // A manager's later-season squad keeps its stored players at the rollover's
  // fresh fitness instead; the players who joined or graduated after the
  // season began are carried over from the stored squad either way.
  for (const id of Object.keys(rs.squads)) {
    if ((state.season || 1) > 1 && id === state.clubId) continue;
    const club = CLUB_BY_ID[id];
    if (!club) continue;
    const built = buildSquad(seed, CLUB_INDEX[id], club.rep, division);
    const builtIds = new Set(built.map((p) => p.id));
    const extras = rs.squads[id].filter((p) => !builtIds.has(p.id));
    rs.squads[id] = built.concat(extras);
  }
  // The eleven the season opened with: the same autoLineup the career and the
  // rollover both set, from the rewound squad and the roles saved today.
  rs.lineup = autoLineup(rs.squads[state.clubId] || [], state.tactics.formation, rs.roles);
  for (let md = 0; md < count; md++) {
    const fixtures = state.fixtures[md];
    if (!Array.isArray(fixtures)) continue;
    const day = fixtures.map((f, i) => simulateMatch(teamFor(rs, f.home), teamFor(rs, f.away), matchSeed(seed, md, i)));
    for (const report of day) applyReport(rs, report);
    reports[md] = day.find((r) => r.home.id === state.clubId || r.away.id === state.clubId) || null;
  }
  return reports;
}

// One entry per played matchday, newest first, everything the Competition
// tab's history row needs. `moments` is null when the matchday's events are
// not kept (the replay drifted from the stored scoreline); every other field
// comes from the stored career and is exact.
export function matchdayHistory(state) {
  if (!state || !Array.isArray(state.fixtures) || !Array.isArray(state.results)) return [];
  const zone = validTimeZone(state.timeZone) ? state.timeZone : 'UTC';
  const own = new Map();
  for (const r of state.results) {
    if (!r || !Number.isInteger(r.matchday)) continue;
    if ((r.home && r.home.id) === state.clubId || (r.away && r.away.id) === state.clubId) own.set(r.matchday, r);
  }
  const count = own.size;
  if (count <= 0) return [];
  const kickoffs = kickoffChain(state, zone, Math.max(...own.keys()));
  const moneyByMatchday = new Map();
  for (const h of Array.isArray(state.financeHistory) ? state.financeHistory : []) {
    if (h && Number.isInteger(h.matchday) && (h.season || 1) === (state.season || 1)) moneyByMatchday.set(h.matchday, h);
  }
  const replay = seasonReplay(state);
  const entries = [];
  for (const md of [...own.keys()].sort((a, b) => a - b)) {
    const r = own.get(md);
    const atHome = r.home.id === state.clubId;
    const goalsFor = atHome ? r.homeGoals : r.awayGoals;
    const goalsAgainst = atHome ? r.awayGoals : r.homeGoals;
    let moments = null;
    let reconciled = false;
    const replayed = replay[md - 1];
    if (replayed && replayed.homeGoals === r.homeGoals && replayed.awayGoals === r.awayGoals) {
      moments = replayed.moments;
      reconciled = true;
    }
    // The newest matchday's own report is stored: the exact truth, whatever
    // the manager has changed since. The matchday check keeps a report that
    // outlived its season from masquerading as this season's.
    const stored = state.lastReport;
    if (stored && stored.matchday === md && md === state.matchday
      && stored.homeGoals === r.homeGoals && stored.awayGoals === r.awayGoals
      && Array.isArray(stored.moments)) {
      moments = stored.moments;
      reconciled = true;
    }
    entries.push({
      matchday: md,
      home: r.home,
      away: r.away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      venue: atHome ? 'Home' : 'Away',
      opponentId: atHome ? r.away.id : r.home.id,
      result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
      credits: creditsForResult(goalsFor, goalsAgainst),
      kickoffISO: kickoffs[md - 1] || null,
      moments,
      money: moneyByMatchday.get(md) || null,
      reconciled,
    });
  }
  return entries.reverse();
}

// What a save changes: the same season and matchday ('same'), the rollover to
// the next season's first matchday ('rollover'), or anything else ('stale').
export function saveCheck(stored, incoming) {
  const s = stored || {};
  const i = incoming || {};
  const sameSeason = (i.season || 1) === (s.season || 1);
  if (sameSeason && (i.matchday || 0) === (s.matchday || 0)) return 'same';
  if (s.finished && sameSeason === false && (i.season || 1) === (s.season || 1) + 1 && (i.matchday || 0) === 0) return 'rollover';
  return 'stale';
}

// Every group in the pyramid, each with the clubs nobody owns yet.
export function freeShopClubs(taken) {
  const set = new Set(Array.isArray(taken) ? taken : []);
  return GROUPS.map((g) => ({
    tier: g.tier,
    group: g.group,
    name: g.name,
    clubIds: g.clubIds.slice(),
    free: g.clubIds.filter((id) => !set.has(id)),
  }));
}

// Who runs a club, in the grey line under its name: the manager's own name for
// their club, another manager's for a club they own, and "Run by a bot" for a
// club nobody has bought. A club a person owns with no stored name reads
// "Manager" alone, never "Run by a bot".
export function managerLine(clubId, owners, ownClubId, ownName) {
  if (clubId === ownClubId && typeof ownName === 'string' && ownName) return 'Manager ' + ownName;
  if (owners && typeof owners === 'object' && !Array.isArray(owners)
    && Object.prototype.hasOwnProperty.call(owners, clubId)) {
    const name = owners[clubId];
    return typeof name === 'string' && name ? 'Manager ' + name : 'Manager';
  }
  return 'Run by a bot';
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// Why a division has the groups it has. Division 1 is one group of 18,
// Division 2 holds four and Division 3 twelve, which with 306 clubs is all
// the league can fill. The counts come from the pyramid, so the sentence
// cannot drift from it.
export function groupsNote(tier) {
  if (!Number.isInteger(tier) || tier < 2 || tier > TIER_COUNT) return '';
  const count = GROUPS.filter((g) => g.tier === tier).length;
  const word = COUNT_WORDS[count] || String(count);
  return 'Division ' + tier + ' has ' + word + ' groups of ' + DIVISION_SIZE
    + ': the Coastal League holds ' + CLUBS.length + ' clubs.';
}

// The New career screen's shop: all seventeen groups, each club with its live
// squad average and whether another manager runs it.
export function shopGroups(taken) {
  const set = new Set(Array.isArray(taken) ? taken : []);
  return GROUPS.map((g, index) => ({
    index,
    tier: g.tier,
    group: g.group,
    name: g.name,
    clubs: g.clubIds.map((id) => ({
      id,
      avg: clubSummary(1, CLUB_BY_ID[id], g.tier).avg,
      taken: set.has(id),
    })),
  }));
}

// ── A career ─────────────────────────────────────────────────────────────
function squadsFor(seed, clubIds, division) {
  const squads = {};
  for (const id of clubIds) {
    squads[id] = buildSquad(seed, CLUB_INDEX[id], CLUB_BY_ID[id].rep, division);
  }
  return squads;
}

function rolesFor(squads) {
  const roles = {};
  for (const id in squads) {
    for (const p of squads[id]) roles[p.id] = defaultRole(p.pos);
  }
  return roles;
}

export function buildInitialState(clubId, managerName, seed) {
  const club = CLUB_BY_ID[clubId];
  if (!club) throw new Error('Unknown club');
  const groups = GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
  const groupIndex = clubToGroup[clubId] || 0;
  const tier = groups[groupIndex].tier;
  const group = groups[groupIndex].group;
  const ids = groups[groupIndex].clubIds;
  const squads = squadsFor(seed, ids, tier);
  const state = {
    version: 3,
    season: 1,
    division: tier,
    group,
    groups,
    groupIndex,
    managerName,
    clubId,
    seed,
    squads,
    fixtures: buildFixtures(seed, ids),
    results: [],
    tactics: { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    // No match played yet today, on the manager's clock (the server saves
    // the zone the first time the page sends one).
    plays: [],
    finished: false,
    lastReport: null,
    credits: 0,
    fans: FAN_SEED[tier],
    sponsor: sponsorFor(seed, 1, tier),
    lastSponsor: null,
    finance: { season: 1, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 },
    financeHistory: [],
    facilities: facilityLevels({}),
    staff: staffFields({}),
    youth: [],
  };
  state.lineup = autoLineup(squads[clubId], state.tactics.formation, state.roles);
  return state;
}

export function clubSummary(seed, club, division = 1) {
  const squad = buildSquad(seed, CLUB_INDEX[club.id], club.rep, division);
  const avg = squad.reduce((s, p) => s + p.overall, 0) / squad.length;
  return { avg: Math.round(avg) };
}

// The place a rank moves to at the end of the season: 'promotion',
// 'relegation' or null. It mirrors nextPlacement's rules, so the table's
// strips and the rollover agree. A career from before the three tiers has none.
export function tableZone(state, rank) {
  if (!(state && state.version >= 3 && Array.isArray(state.groups)
    && state.groups[state.groupIndex])) return null;
  const tier = state.division;
  if (tier === 1) return rank >= 11 ? 'relegation' : null;
  if (tier === 2) {
    const size = divisionClubIds(state).length;
    if (rank <= 2) return 'promotion';
    if (rank > size - 6) return 'relegation';
    return null;
  }
  return rank <= 2 ? 'promotion' : null;
}

// Where a finished season leaves the manager: how they finished, and the tier
// and group they play in next. In the three-tier league the bottom 8 of
// Division 1 go down; the top 2 of each Division 2 and Division 3 group go up,
// the bottom 6 of each Division 2 group go down into its three Division 3
// groups, and nobody leaves Division 3.
export function nextPlacement(state) {
  const table = leagueTable(state);
  const size = divisionClubIds(state).length;
  const me = table.find((r) => r.id === state.clubId);
  const rank = me ? me.rank : size;

  if (state && state.version >= 3 && Array.isArray(state.groups) && state.groups[state.groupIndex]) {
    const tier = state.division;
    const letter = state.group || null;
    if (tier === 1) {
      if (rank === 1) return { kind: 'champions', rank, size, tier: 1, group: null };
      if (rank >= 11) {
        return { kind: 'relegated', rank, size, tier: 2, group: GROUP_LETTERS[(rank - 11) % GROUP_COUNTS[2]] };
      }
      return { kind: 'stayed', rank, size, tier: 1, group: null };
    }
    if (tier === 2) {
      if (rank <= 2) return { kind: 'promoted', rank, size, tier: 1, group: null };
      if (rank > size - 6) {
        // 18th and 17th go to the first feeder, 16th and 15th to the second,
        // 14th and 13th to the third.
        const feeder = feederIndices(state.groupIndex)[relegationFeeder(rank)];
        return { kind: 'relegated', rank, size, tier: 3, group: GROUPS[feeder].group };
      }
      return { kind: 'stayed', rank, size, tier: 2, group: letter };
    }
    if (rank <= 2) {
      return { kind: 'promoted', rank, size, tier: 2, group: GROUPS[parentIndex(state.groupIndex)].group };
    }
    return { kind: 'stayed', rank, size, tier: 3, group: letter };
  }

  // A career saved before the three tiers: today's rule decides its next
  // division, then the division maps onto a tier.
  const isV1 = !(state.version >= 2) || !Array.isArray(state.divisions);
  if (isV1) return { kind: 'stayed', rank, size, tier: 1, group: null, joinsNewLeague: true };
  const division = state.division;
  let kind = 'stayed';
  let next = division;
  if (division === 1 && rank === 1) kind = 'champions';
  else if (division > 1 && rank <= 3) { kind = 'promoted'; next = division - 1; }
  else if (division < LEGACY_DIVISION_COUNT && rank > size - 3) { kind = 'relegated'; next = division + 1; }
  const tier = next === 1 ? 1 : next === 2 ? 2 : 3;
  const own = GROUPS[clubToGroup[state.clubId]];
  const group = tier === 1 ? null : own && own.tier === tier ? own.group : 'A';
  return { kind, rank, size, tier, group, joinsNewLeague: true };
}

// How a finished season ended for the manager: where they finished, and the
// tier and group they move to.
export function seasonOutcome(state) {
  const placement = nextPlacement(state);
  return { ...placement, toDivision: placement.tier, toGroup: placement.group };
}

// Summer: the manager's own players stay and start again from zero; everyone
// else in the new division is dealt a squad at that division's strength.
function playerForNewSeason(p) {
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age,
    peak: p.peak,
    attrs: p.attrs,
    overall: p.overall,
    fitness: 100,
    morale: p.morale,
    injury: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    yellow: 0,
    red: 0,
    captain: p.captain,
    ...(p.academy ? { academy: p.academy } : {}),
  };
}

// One of the groups the manager is not in, played out from the season's seed
// so the same career always gives the same final table.
function simulateGroup(seed, index, tier, clubIds) {
  const squads = squadsFor(seed, clubIds, tier);
  const state = {
    version: 3,
    season: 1, // season 1 means seasonSeed(state) is the seed handed in
    division: tier,
    group: null,
    groups: [{ tier, group: null, clubIds: clubIds.slice() }],
    groupIndex: 0,
    managerName: '',
    clubId: null,
    seed,
    squads,
    fixtures: buildFixtures(hash(seed, 'group', index), clubIds),
    results: [],
    tactics: { formation: '4-4-2', mentality: 'Balanced', pressing: 'Medium' },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  while (!state.finished) playMatchday(state);
  return leagueTable(state);
}

// Apply promotion and relegation, then start the next season with the same
// club and players in its new group. Only a finished season rolls over.
export function startNextSeason(state) {
  if (!state || !state.finished) return state;
  const isV1 = !(state.version >= 2);
  const isV3 = state.version >= 3 && Array.isArray(state.groups) && !!state.groups[state.groupIndex];
  const season = (state.season || 1) + 1;
  let groups;
  let groupIndex;
  if (isV3) {
    groups = pyramidGroups(state);
    const seed = seasonSeed(state);
    const tables = groups.map((g, i) => (i === state.groupIndex
      ? leagueTable(state)
      : simulateGroup(seed, i, g.tier, g.clubIds)));
    const d2Count = GROUP_COUNTS[2];
    // Division 1 loses its bottom 8, two into each Division 2 group in order
    // of finish, and gains the top 2 of each Division 2 group.
    const relegated = tables[0].slice(10, 18).map((r) => r.id);
    groups[0].clubIds = groups[0].clubIds.filter((id) => !relegated.includes(id));
    relegated.forEach((id, k) => { groups[D2_FIRST + (k % d2Count)].clubIds.push(id); });
    for (let gi = D2_FIRST; gi < D2_FIRST + d2Count; gi++) {
      const up = tables[gi].slice(0, 2).map((r) => r.id);
      groups[gi].clubIds = groups[gi].clubIds.filter((id) => !up.includes(id));
      groups[0].clubIds.push(...up);
    }
    // Each Division 2 group's bottom 6 go down into its three Division 3
    // groups, two each in finish order, and it takes in the top 2 of each of
    // them. Nobody leaves Division 3.
    for (let gi = D2_FIRST; gi < D2_FIRST + d2Count; gi++) {
      const feeders = feederIndices(gi);
      const down = tables[gi].slice(-6).map((r) => r.id);
      groups[gi].clubIds = groups[gi].clubIds.filter((id) => !down.includes(id));
      down.forEach((id, k) => {
        groups[feeders[relegationFeeder(13 + k)]].clubIds.push(id);
      });
      for (const f of feeders) {
        const up = tables[f].slice(0, 2).map((r) => r.id);
        groups[f].clubIds = groups[f].clubIds.filter((id) => !up.includes(id));
        groups[gi].clubIds.push(...up);
      }
    }
    groupIndex = groups.findIndex((g) => g.clubIds.includes(state.clubId));
    if (groupIndex < 0) groupIndex = 0;
  } else {
    // A career from before the three tiers joins the new league: it keeps the
    // season it was in, and starts next season in the tier it lands in. If its
    // club is not already there it swaps with the weakest club of that tier's
    // first group.
    const placement = nextPlacement(state);
    groups = GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
    const own = clubToGroup[state.clubId];
    if (!isV1 && groups[own] && groups[own].tier === placement.tier) {
      groupIndex = own;
    } else {
      groupIndex = groups.findIndex((g) => g.tier === placement.tier);
      // If the club is not already in the target group, it swaps with that
      // group's weakest club, which takes its place in its starting group.
      let victim = null;
      if (!groups[groupIndex].clubIds.includes(state.clubId)) {
        for (const id of groups[groupIndex].clubIds) {
          if (!victim || CLUB_BY_ID[id].rep < CLUB_BY_ID[victim].rep) victim = id;
        }
      }
      if (victim) {
        groups[groupIndex].clubIds = groups[groupIndex].clubIds.filter((id) => id !== victim).concat(state.clubId);
        if (groups[own] && own !== groupIndex) {
          groups[own].clubIds = groups[own].clubIds.filter((id) => id !== state.clubId).concat(victim);
        }
      }
    }
  }
  const newDivision = groups[groupIndex].tier;
  const seed = seasonSeed({ seed: state.seed, season });
  const ids = groups[groupIndex].clubIds;
  // The manager's players get a year older; the ones who retire are replaced
  // one for one by an academy graduate in the same position, so the squad
  // keeps its size and its goalkeepers.
  const aged = ageingFor(state);
  const leaving = new Set(aged.retiring.map((r) => r.id));
  const academy = facilityLevels(state).academy;
  const own = aged.players.filter((p) => !leaving.has(p.id)).map(playerForNewSeason);
  aged.retiring.forEach((r, i) => {
    own.push(playerForNewSeason(academyGraduate(state.seed, season, i, r.pos, academy, newDivision)));
  });
  const squads = { [state.clubId]: own };
  for (const id of ids) {
    if (id === state.clubId) continue;
    squads[id] = buildSquad(seed, CLUB_INDEX[id], CLUB_BY_ID[id].rep, newDivision);
  }
  const next = {
    version: 3,
    season,
    division: newDivision,
    group: groups[groupIndex].group,
    groups,
    groupIndex,
    managerName: state.managerName,
    clubId: state.clubId,
    seed: state.seed,
    squads,
    fixtures: buildFixtures(seed, ids),
    results: [],
    tactics: { ...state.tactics },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
    // The money fields the finished season leaves: the sponsor fee if its
    // target was met, the fans carried over, and a fresh season's totals.
    ...seasonEndMoney(state),
    // The facilities stay with the club into the next season, and so do the
    // staff and the academy's prospects.
    facilities: facilityLevels(state),
    staff: staffFields(state),
    youth: youthFields(state),
  };
  // The manager's players keep the roles they were given.
  for (const p of next.squads[next.clubId]) {
    if (state.roles && state.roles[p.id]) next.roles[p.id] = state.roles[p.id];
  }
  next.lineup = autoLineup(next.squads[next.clubId], next.tactics.formation, next.roles);
  // The wallet, the purchase, the day's matches and the manager's clock
  // belong to the career, not the season.
  if (state.wallet) next.wallet = { ...state.wallet };
  if (state.purchase) next.purchase = { ...state.purchase };
  next.plays = Array.isArray(state.plays) ? state.plays.slice(-MATCHES_PER_DAY) : [];
  if (state.timeZone) next.timeZone = state.timeZone;
  // The server stamps the next kick-off on the rollover save.
  next.nextMatchAt = null;
  return next;
}

// The money a finished season leaves for the next one: the sponsor's fee paid
// if its target was met, fans carried over, and this season's totals reset.
// The server settles a rollover save from the stored season with this, so the
// page cannot award itself the fee.
export function seasonEndMoney(state) {
  const m = moneyFields(state);
  const season = state.season || 1;
  const table = leagueTable(state);
  const size = divisionClubIds(state).length;
  const me = table.find((r) => r.id === state.clubId);
  const rank = me ? me.rank : size;
  const met = objectiveMet(rank, m.sponsor.target, size);
  const next = season + 1;
  const nextTier = nextPlacement(state).tier;
  const fanCap = FAN_CAP[nextTier] || FAN_CAP[3];
  return {
    credits: m.credits + (met ? m.sponsor.fee : 0),
    fans: Math.min(m.fans, fanCap),
    sponsor: sponsorFor(state.seed, next, nextTier),
    lastSponsor: { ...m.sponsor, paid: met },
    finance: { season: next, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 },
    financeHistory: [],
  };
}

// The staging demo: Harbourside seventeen matchdays into a Division 1 season,
// with one injury and one booking to show, the last result and the table
// already filled in.
export function buildDemoState(seed) {
  const state = buildInitialState('harbourside', 'Demo Manager', seed);
  // A partly built club, with a coach and a physio, so the money lines and
  // the academy have something from the first matchday on.
  state.facilities = { ...facilityLevels(state), stadium: 4, training: 2, toilets: 3 };
  state.staff = staffFields({
    staff: {
      coach: { name: 'Theo Marsh', season: 1, matchday: 0 },
      physio: { name: 'Pia Lund', season: 1, matchday: 0 },
    },
  });
  for (let i = 0; i < 17; i++) playMatchday(state);
  // The demo shows exactly one injured player and one booked player.
  const squad = state.squads.harbourside;
  for (const p of squad) { p.injury = 0; p.yellow = 0; p.red = 0; }
  const benchPick = squad.filter((p) => !state.lineup.includes(p.id) && POS_GROUP[p.pos] !== 'GK')
    .sort((a, b) => b.overall - a.overall)[0] || squad[squad.length - 1];
  if (benchPick) benchPick.injury = 2;
  const booked = squad.find((p) => POS_GROUP[p.pos] === 'DF' && p !== benchPick) || squad[1];
  if (booked) booked.yellow = 1;
  state.lineup = autoLineup(squad, state.tactics.formation, state.roles);
  fixLineup(state);
  state.managerName = 'Demo Manager';
  // The demo bought its club, so the Wallet section has something to show.
  state.wallet = { currency: 'Dummy USDC', balance: 900 };
  state.purchase = { clubId: 'harbourside', price: 100, at: '2026-01-15T12:00:00.000Z', demo: true };
  return state;
}

// Find a seed whose demo puts Harbourside third after seventeen matchdays in
// Division 1. Done once, offline, and the answer is written into server.js as
// DEMO_SEED.
export function findDemoSeed(max = 400) {
  for (let seed = 1; seed <= max; seed++) {
    const state = buildDemoState(seed);
    const table = leagueTable(state);
    const me = table.find((r) => r.id === 'harbourside');
    if (me && me.rank === 3 && me.played === 17) return { seed, points: me.points, table: table.map((r) => [r.rank, r.name, r.points]) };
  }
  return null;
}

// ── The shared league ────────────────────────────────────────────────────
// One Coastal League every manager plays in together. The server keeps one
// row per group and plays every due kick-off for all 17 groups, so two
// managers in the same group read the same table, fixture list and report.
export const LEAGUE_SEED = 771201;
export const LEAGUE_ZONE = 'Europe/London';

// A club nobody has taken over yet: no Club credits, no staff, no prospects,
// the division's starting fans and a sponsor for the season.
export function leagueClubEntry(seed, season, tier) {
  return {
    credits: 0,
    fans: FAN_SEED[tier] || FAN_SEED[3],
    facilities: facilityLevels({}),
    staff: staffFields({}),
    youth: [],
    finance: { season, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 },
    financeHistory: [],
    sponsor: sponsorFor(seed, season, tier),
    lastSponsor: null,
    lastReport: null,
  };
}

// One group's row. `carried` is the squads and club entries the previous
// season leaves for these clubs, keyed by club id.
export function buildLeagueGroup(seed, season, index, group, carried) {
  const ids = group.clubIds.slice();
  const ss = seasonSeed({ seed, season });
  const squads = {};
  const clubs = {};
  for (const id of ids) {
    const old = carried && carried[id];
    squads[id] = old && Array.isArray(old.squad)
      ? old.squad
      : buildSquad(ss, CLUB_INDEX[id], CLUB_BY_ID[id].rep, group.tier);
    clubs[id] = old && old.entry ? old.entry : leagueClubEntry(seed, season, group.tier);
  }
  return {
    season,
    tier: group.tier,
    group: group.group,
    clubIds: ids,
    squads,
    fixtures: buildFixtures(hash(ss, 'group', index), ids),
    results: [],
    matchday: 0,
    finished: false,
    clubs,
  };
}

// The descriptors for the 17 groups, in GROUPS order.
export function leagueGroups() {
  return GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
}

// Season 1 of the shared league, matchday 0, waiting for the server to stamp
// its first kick-off.
export function buildLeague(seed = LEAGUE_SEED) {
  return {
    season: 1,
    seed,
    groups: leagueGroups(),
    matchday: 0,
    phase: 'playing',
    nextMatchAt: null,
    plays: [],
  };
}

function leagueClubView(group, index, league, clubId, managers) {
  const entry = group.clubs[clubId] || leagueClubEntry(league.seed, league.season, group.tier);
  const mgr = managers && managers[clubId];
  const club = CLUB_BY_ID[clubId];
  let tactics = { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' };
  let roles = {};
  if (mgr && mgr.tactics && FORMATIONS[mgr.tactics.formation]) {
    tactics = {
      formation: mgr.tactics.formation,
      mentality: MENTALITIES[mgr.tactics.mentality] ? mgr.tactics.mentality : 'Balanced',
      pressing: PRESSING[mgr.tactics.pressing] ? mgr.tactics.pressing : 'Medium',
    };
  }
  if (mgr && mgr.roles && typeof mgr.roles === 'object') roles = mgr.roles;
  const lineup = mgr && lineupUsable(group.squads[clubId], mgr.lineup)
    ? mgr.lineup.slice()
    : autoLineup(group.squads[clubId], tactics.formation, roles);
  return {
    version: 3,
    season: league.season,
    seed: league.seed,
    division: group.tier,
    group: group.group,
    groups: league.groups,
    groupIndex: index,
    clubId,
    managerName: mgr && typeof mgr.manager_name === 'string' ? mgr.manager_name : '',
    squads: group.squads,
    fixtures: group.fixtures,
    results: group.results,
    matchday: group.matchday,
    finished: group.finished,
    tactics,
    roles,
    lineup,
    plays: league.plays || [],
    credits: entry.credits,
    fans: entry.fans,
    facilities: entry.facilities,
    staff: entry.staff,
    youth: entry.youth,
    finance: entry.finance,
    financeHistory: entry.financeHistory,
    sponsor: entry.sponsor,
    lastSponsor: entry.lastSponsor,
    lastReport: entry.lastReport,
  };
}

// Play one group's next matchday: every fixture, both sides' player effects,
// and each club's own money, fans, finance history and academy intake. A
// manager's saved lineup, tactics and roles are used for their club; any
// other, or an unusable lineup, gets the bot's best eleven. Returns the
// lineups that had to be rebuilt so the server can store them.
export function playLeagueMatchday(group, index, league, managers) {
  const rebuilt = {};
  if (group.matchday >= group.fixtures.length) return rebuilt;
  const md = group.matchday;
  const ss = seasonSeed({ seed: league.seed, season: league.season });
  const reports = [];
  group.fixtures[md].forEach((f, i) => {
    const home = teamFor(group, f.home, managers);
    const away = teamFor(group, f.away, managers);
    const report = simulateMatch(home, away, matchSeed(ss, md, i));
    report.matchday = md + 1;
    report.fixtureIndex = i;
    reports.push(report);
  });
  const neutral = { squads: group.squads, clubId: null, tactics: { formation: '4-4-2' }, roles: {} };
  for (const r of reports) applyReport(neutral, r);
  for (const clubId of group.clubIds) {
    const mgr = managers && managers[clubId];
    if (mgr && !lineupUsable(group.squads[clubId], mgr.lineup)) {
      rebuilt[clubId] = teamFor(group, clubId, managers).lineup;
    }
  }
  for (const id of group.clubIds) {
    const view = leagueClubView(group, index, league, id, managers);
    const own = reports.find((r) => r.home.id === id || r.away.id === id) || null;
    view.lastReport = own;
    if (own) settleClubMatch(view, own, md);
    const entry = group.clubs[id];
    entry.credits = view.credits;
    entry.fans = view.fans;
    entry.facilities = view.facilities;
    entry.staff = view.staff;
    entry.youth = view.youth;
    entry.finance = view.finance;
    entry.financeHistory = view.financeHistory;
    entry.sponsor = view.sponsor;
    entry.lastSponsor = view.lastSponsor;
    entry.lastReport = view.lastReport;
  }
  for (const r of reports) {
    group.results.push({
      matchday: r.matchday,
      home: r.home,
      away: r.away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
    });
  }
  group.matchday = md + 1;
  group.finished = group.matchday >= group.fixtures.length;
  return rebuilt;
}

// Promotion and relegation, from the 17 final tables, unchanged from the
// solo rollover. Returns the next season's group descriptors.
export function movePyramid(groups, tables) {
  const next = groups.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
  const d1 = 0;
  const d2First = 1;
  const d2Count = GROUP_COUNTS[2];
  // Division 1 loses its bottom 8, two into each Division 2 group in order of
  // finish, and gains the top 2 of each Division 2 group.
  const relegated = tables[d1].slice(10, 18).map((r) => r.id);
  next[d1].clubIds = next[d1].clubIds.filter((id) => !relegated.includes(id));
  relegated.forEach((id, k) => { next[d2First + (k % d2Count)].clubIds.push(id); });
  for (let gi = d2First; gi < d2First + d2Count; gi++) {
    const up = tables[gi].slice(0, 2).map((r) => r.id);
    next[gi].clubIds = next[gi].clubIds.filter((id) => !up.includes(id));
    next[d1].clubIds.push(...up);
  }
  // Each Division 2 group's bottom 6 go down into its three Division 3
  // groups, two each in finish order, and it takes in the top 2 of each of
  // them. Nobody leaves Division 3.
  for (let gi = d2First; gi < d2First + d2Count; gi++) {
    const feeders = feederIndices(gi);
    const down = tables[gi].slice(-6).map((r) => r.id);
    next[gi].clubIds = next[gi].clubIds.filter((id) => !down.includes(id));
    down.forEach((id, k) => {
      next[feeders[relegationFeeder(13 + k)]].clubIds.push(id);
    });
    for (const f of feeders) {
      const up = tables[f].slice(0, 2).map((r) => r.id);
      next[f].clubIds = next[f].clubIds.filter((id) => !up.includes(id));
      next[gi].clubIds.push(...up);
    }
  }
  return next;
}

// A club's squad the summer leaves it: a year older, with a graduate in the
// place of every retiree.
export function carryClubSquad(state, season, tier) {
  const aged = ageingFor(state);
  const leaving = new Set(aged.retiring.map((r) => r.id));
  const academy = facilityLevels(state).academy;
  const players = aged.players.filter((p) => !leaving.has(p.id)).map(playerForNewSeason);
  aged.retiring.forEach((r, i) => {
    players.push(playerForNewSeason(academyGraduate(state.seed, season, i, r.pos, academy, tier)));
  });
  return players;
}

// The next season: promotion and relegation once, every club's squad aged and
// carried, its money settled, and its facilities, staff and prospects kept.
export function nextLeagueSeason(league, groups) {
  const descriptors = groups.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
  const tables = groups.map((g, i) => leagueTable({
    version: 3,
    season: league.season,
    seed: league.seed,
    division: g.tier,
    group: g.group,
    groups: descriptors,
    groupIndex: i,
    clubIds: g.clubIds,
    squads: g.squads,
    fixtures: g.fixtures,
    results: g.results,
    matchday: g.matchday,
    finished: g.finished,
    clubId: null,
  }));
  const moved = movePyramid(descriptors, tables);
  const season = league.season + 1;
  return moved.map((d, i) => {
    const carried = {};
    for (const id of d.clubIds) {
      const oldIndex = groups.findIndex((g) => g.clubIds.includes(id));
      const old = groups[oldIndex >= 0 ? oldIndex : 0];
      if (!old || !old.clubIds.includes(id)) continue;
      const view = leagueClubView(old, oldIndex, league, id, null);
      const money = seasonEndMoney(view);
      carried[id] = {
        squad: carryClubSquad(view, season, d.tier),
        entry: {
          credits: money.credits,
          fans: Math.min(money.fans, FAN_CAP[d.tier] || FAN_CAP[3]),
          facilities: view.facilities,
          staff: view.staff,
          youth: view.youth,
          finance: money.finance,
          financeHistory: [],
          sponsor: money.sponsor,
          lastSponsor: money.lastSponsor,
          lastReport: null,
        },
      };
    }
    return buildLeagueGroup(league.seed, season, i, d, carried);
  });
}

// Every kick-off that has passed, for the whole league, in order. The first
// slot after the last matchday rolls the season over; the first matchday of
// the new season plays at the slot after that.
export function playDueLeague(league, groups, managers, now) {
  const at = now instanceof Date ? now : new Date(now);
  let played = 0;
  let rollover = null;
  const rebuilt = {};
  while (league.nextMatchAt && Date.parse(league.nextMatchAt) <= at.getTime()) {
    const slot = new Date(league.nextMatchAt);
    league.plays = (Array.isArray(league.plays) ? league.plays : []).concat(slot.toISOString()).slice(-MATCHES_PER_DAY);
    if (league.phase === 'summer') {
      const rolled = nextLeagueSeason(league, groups);
      groups.splice(0, groups.length, ...rolled);
      league.season += 1;
      league.groups = rolled.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds }));
      league.matchday = 0;
      league.phase = 'playing';
      rollover = { season: league.season };
      league.nextMatchAt = slotAfter(slot, LEAGUE_ZONE).toISOString();
      continue;
    }
    for (let i = 0; i < groups.length; i++) {
      Object.assign(rebuilt, playLeagueMatchday(groups[i], i, league, managers));
    }
    league.matchday = (league.matchday || 0) + 1;
    if (league.matchday >= MATCHDAYS) {
      league.matchday = MATCHDAYS;
      league.phase = 'summer';
    }
    league.nextMatchAt = slotAfter(slot, LEAGUE_ZONE).toISOString();
    played++;
  }
  return { played, rollover, rebuilt };
}

// What a shared-league manager's page reads: the same career-shaped state the
// tabs already render, built from the group and the manager's own tactics.
export function clubView(league, group, index, clubId, manager) {
  const managers = manager ? { [clubId]: manager } : {};
  const view = leagueClubView(group, index, league, clubId, managers);
  view.mode = 'shared';
  view.timeZone = LEAGUE_ZONE;
  view.nextMatchAt = league.phase === 'summer' ? null : league.nextMatchAt;
  view.nextSeasonAt = league.phase === 'summer' ? league.nextMatchAt : null;
  return view;
}

// Split a club view back into the club entry and its squad, so the engine's
// club actions (facilities, staff, academy, sales) work on a shared club.
export function clubFromView(view) {
  return {
    squad: view.squads[view.clubId],
    entry: {
      credits: view.credits,
      fans: view.fans,
      facilities: view.facilities,
      staff: view.staff,
      youth: view.youth,
      finance: view.finance,
      financeHistory: view.financeHistory,
      sponsor: view.sponsor,
      lastSponsor: view.lastSponsor,
      lastReport: view.lastReport,
    },
  };
}
