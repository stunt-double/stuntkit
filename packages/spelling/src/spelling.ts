// Whole-word spelling localisation for English, in either direction: British,
// American or Canadian from whichever of the first two a string was written in.
//
// Every map normalises both ways, so a British word left in American source
// copy still comes out American for an American reader, and the reverse.
//
// Every entry is a whole word, generated from a stem and the suffixes it
// takes, and looked up exactly: nothing is rewritten by pattern alone. That is
// deliberate. "-ise" is not a safe rule ("promise", "enterprise", "expertise",
// "advertise", "precise" and "otherwise" all keep it in American English), and
// neither is "-our" ("four", "hour", "tour", "contour") or "-tre". A word that
// is missing from these lists simply stays as written, which is the right way
// to fail. To cover a new word, add its stem to the list it belongs to.
//
// Proper nouns that happen to look British ("Parlour", a business name) are
// not in any list, so they are never touched.

/**
 * A spelling system: British (also Australia, New Zealand, Ireland and most
 * of the Commonwealth), American, or Canadian (British "-our", "-re" and
 * doubled "l", American "-ize" and "-yze").
 */
export type SpellingSystem = 'british' | 'american' | 'canadian';

// Stems of "-ise" verbs whose American form is "-ize": organ -> organise,
// organised, organisation, ... -> organize, organized, organization, ...
const IZE_STEMS = [
  'anonym',
  'apolog',
  'author',
  'canonical',
  'capital',
  'categor',
  'central',
  'character',
  'container',
  'contextual',
  'critic',
  'custom',
  'democrat',
  'digit',
  'emphas',
  'energ',
  'equal',
  'final',
  'formal',
  'general',
  'global',
  'harmon',
  'human',
  'hypothes',
  'ideal',
  'incentiv',
  'individual',
  'industrial',
  'initial',
  'internal',
  'item',
  'legal',
  'legitim',
  'local',
  'maxim',
  'memo',
  'memor',
  'minim',
  'mobil',
  'modern',
  'monet',
  'neutral',
  'normal',
  'notar',
  'operational',
  'optim',
  'organ',
  'parameter',
  'personal',
  'polar',
  'priorit',
  'privat',
  'product',
  'pseudonym',
  'random',
  'raster',
  'rational',
  'real',
  'recogn',
  'revolution',
  'sanit',
  'scrutin',
  'serial',
  'social',
  'special',
  'stabil',
  'standard',
  'strateg',
  'summar',
  'symbol',
  'sympath',
  'synchron',
  'synthes',
  'theor',
  'token',
  'trivial',
  'util',
  'vector',
  'visual',
];

const IZE_SUFFIXES = [
  'e',
  'es',
  'ed',
  'ing',
  'er',
  'ers',
  'ation',
  'ations',
  'ational',
  'able',
  'ably',
  'ability',
];

// Stems of "-yse" verbs: anal -> analyse -> analyze.
const YZE_STEMS = ['anal', 'catal', 'paral', 'hydrol'];
const YZE_SUFFIXES = ['e', 'es', 'ed', 'ing', 'er', 'ers'];

// "-our" words whose American form is "-or": colour -> color.
const OUR_STEMS = [
  'arb',
  'ard',
  'arm',
  'behavi',
  'col',
  'endeav',
  'fav',
  'flav',
  'harb',
  'hon',
  'hum',
  'lab',
  'neighb',
  'od',
  'rum',
  'sav',
  'vap',
  'vig',
];
const OUR_SUFFIXES = [
  '',
  's',
  'ed',
  'ing',
  'ful',
  'fully',
  'less',
  'al',
  'ally',
  'ite',
  'ites',
  'able',
  'ably',
  'hood',
  'hoods',
  'er',
  'ers',
  'y',
];

// "-re" nouns whose American form is "-er": centre -> center, fibre -> fiber.
// Stems stop before the "re".
const RE_STEMS = [
  'calib',
  'cent',
  'centimet',
  'fib',
  'kilomet',
  'lit',
  'meag',
  'met',
  'millimet',
  'somb',
  'spect',
  'theat',
];
const RE_SUFFIXES: Array<[british: string, american: string]> = [
  ['re', 'er'],
  ['res', 'ers'],
  ['red', 'ered'],
  ['ring', 'ering'],
];

// A final "l" that British English doubles before a suffix and American
// English does not: cancelled -> canceled.
const DOUBLE_L_STEMS = [
  'cancel',
  'channel',
  'dial',
  'fuel',
  'funnel',
  'label',
  'level',
  'marshal',
  'model',
  'signal',
  'total',
  'travel',
  'tunnel',
];
const DOUBLE_L_SUFFIXES = ['ed', 'ing', 'er', 'ers'];

// Prefixes the generated forms also take: unrecognised, recoloured, mislabelled.
const PREFIXES = ['', 'un', 're', 'de', 'dis', 'mis', 'non', 'pre', 'over', 'under', 'auto'];

// One-off words, British on the left.
const AMERICAN_WORDS: Record<string, string> = {
  aeroplane: 'airplane',
  aeroplanes: 'airplanes',
  ageing: 'aging',
  aluminium: 'aluminum',
  analogue: 'analog',
  artefact: 'artifact',
  artefacts: 'artifacts',
  catalogue: 'catalog',
  catalogues: 'catalogs',
  catalogued: 'cataloged',
  cataloguing: 'cataloging',
  cheque: 'check',
  cheques: 'checks',
  cosy: 'cozy',
  counsellor: 'counselor',
  counsellors: 'counselors',
  defence: 'defense',
  defences: 'defenses',
  enrol: 'enroll',
  enrols: 'enrolls',
  enrolment: 'enrollment',
  enrolments: 'enrollments',
  focussed: 'focused',
  focussing: 'focusing',
  fulfil: 'fulfill',
  fulfils: 'fulfills',
  fulfilment: 'fulfillment',
  grey: 'gray',
  greyed: 'grayed',
  greying: 'graying',
  greyish: 'grayish',
  greys: 'grays',
  instalment: 'installment',
  instalments: 'installments',
  jeweller: 'jeweler',
  jewellers: 'jewelers',
  jewellery: 'jewelry',
  judgement: 'judgment',
  judgements: 'judgments',
  kerb: 'curb',
  learnt: 'learned',
  licence: 'license',
  licences: 'licenses',
  manoeuvre: 'maneuver',
  manoeuvres: 'maneuvers',
  marvellous: 'marvelous',
  maths: 'math',
  mould: 'mold',
  moulds: 'molds',
  offence: 'offense',
  offences: 'offenses',
  orientated: 'oriented',
  paediatric: 'pediatric',
  practise: 'practice',
  practised: 'practiced',
  practises: 'practices',
  practising: 'practicing',
  pretence: 'pretense',
  programme: 'program',
  programmes: 'programs',
  pyjamas: 'pajamas',
  sceptic: 'skeptic',
  sceptical: 'skeptical',
  sceptically: 'skeptically',
  scepticism: 'skepticism',
  skilful: 'skillful',
  skilfully: 'skillfully',
  storey: 'story',
  storeys: 'stories',
  tyre: 'tire',
  tyres: 'tires',
  wilful: 'willful',
  wilfully: 'willfully',
  woollen: 'woolen',
};

// American words that are only sometimes the British one, so they are never
// rewritten towards British: "practice" is also the British noun, "license"
// the British verb, "check", "story", "tire" and "program" (software) are
// British words in their own right, "meter" measures usage, and "artifact" is
// as often a technical term (a build artifact) as a spelling.
const NOT_BRITISH = new Set([
  'humoral',
  'respecter',
  'respecters',
  'artifact',
  'artifacts',
  'check',
  'checks',
  'curb',
  'focused',
  'focusing',
  'learned',
  'license',
  'licenses',
  'meter',
  'metered',
  'metering',
  'meters',
  'oriented',
  'practice',
  'practices',
  'program',
  'programs',
  'stories',
  'story',
  'tire',
  'tires',
]);

// British words that are also American words, so they are never rewritten
// towards American: "analyses" is the plural of "analysis" in both.
const NOT_AMERICAN = new Set(['analyses', 'catalyses', 'hydrolyses', 'paralyses']);

// Canadian English keeps "-our", "-re", the doubled "l" and "-ogue" (the
// British side), and takes "-ize", "-yze" and these words from the American.
const CANADIAN_AMERICAN_WORDS = [
  'aeroplane',
  'aeroplanes',
  'ageing',
  'aluminium',
  'cosy',
  'kerb',
  'maths',
  'artefact',
  'artefacts',
  'programme',
  'programmes',
  'sceptic',
  'sceptical',
  'sceptically',
  'scepticism',
  'tyre',
  'tyres',
];

type Pairs = Array<[british: string, american: string]>;

function withPrefixes(pairs: Pairs, british: string, american: string): void {
  for (const prefix of PREFIXES) pairs.push([prefix + british, prefix + american]);
}

function izePairs(): Pairs {
  const pairs: Pairs = [];
  for (const stem of IZE_STEMS) {
    for (const suffix of IZE_SUFFIXES) {
      withPrefixes(pairs, `${stem}is${suffix}`, `${stem}iz${suffix}`);
    }
  }
  for (const stem of YZE_STEMS) {
    for (const suffix of YZE_SUFFIXES) {
      withPrefixes(pairs, `${stem}ys${suffix}`, `${stem}yz${suffix}`);
    }
  }
  return pairs;
}

// Everything Canadian spells the British way.
function britishSidePairs(): Pairs {
  const pairs: Pairs = [];
  for (const stem of OUR_STEMS) {
    for (const suffix of OUR_SUFFIXES) {
      // "-ourite" and "-ourable" drop the "u" too: favourite -> favorite.
      withPrefixes(pairs, `${stem}our${suffix}`, `${stem}or${suffix}`);
    }
  }
  for (const stem of RE_STEMS) {
    for (const [british, american] of RE_SUFFIXES) {
      withPrefixes(pairs, stem + british, stem + american);
    }
  }
  for (const stem of DOUBLE_L_STEMS) {
    for (const suffix of DOUBLE_L_SUFFIXES) {
      withPrefixes(pairs, `${stem}l${suffix}`, stem + suffix);
    }
  }
  const canadianAmerican = new Set(CANADIAN_AMERICAN_WORDS);
  for (const [british, american] of Object.entries(AMERICAN_WORDS)) {
    if (!canadianAmerican.has(british)) withPrefixes(pairs, british, american);
  }
  return pairs;
}

function americanSideWords(): Pairs {
  const pairs: Pairs = [];
  for (const word of CANADIAN_AMERICAN_WORDS) withPrefixes(pairs, word, AMERICAN_WORDS[word]);
  return pairs;
}

function toAmerican(map: Map<string, string>, pairs: Pairs): void {
  for (const [british, american] of pairs) {
    if (!withAnyPrefix(NOT_AMERICAN).has(british)) map.set(british, american);
  }
}

function toBritish(map: Map<string, string>, pairs: Pairs): void {
  for (const [british, american] of pairs) {
    if (!withAnyPrefix(NOT_BRITISH).has(american)) map.set(american, british);
  }
}

// A word list plus every prefixed form the generated pairs can take.
const prefixed = new Map<Set<string>, Set<string>>();
function withAnyPrefix(words: Set<string>): Set<string> {
  let all = prefixed.get(words);
  if (!all) {
    all = new Set(PREFIXES.flatMap((prefix) => [...words].map((word) => prefix + word)));
    prefixed.set(words, all);
  }
  return all;
}

function build(system: SpellingSystem): Map<string, string> {
  const map = new Map<string, string>();
  const ize = izePairs();
  const britishSide = britishSidePairs();
  const americanSide = americanSideWords();
  if (system === 'american') {
    toAmerican(map, [...ize, ...britishSide, ...americanSide]);
  } else if (system === 'british') {
    toBritish(map, [...ize, ...britishSide, ...americanSide]);
  } else {
    toAmerican(map, [...ize, ...americanSide]);
    toBritish(map, britishSide);
  }
  // A word that means the same thing in both spellings maps to itself; drop it
  // so the lookup stays a pure "rewrite this" list.
  for (const [from, to] of map) if (from === to) map.delete(from);
  return map;
}

const dictionaries: Partial<Record<SpellingSystem, Map<string, string>>> = {};

/** The word map for a spelling system (source spelling to target), built on first use. */
export function spellingDictionary(system: SpellingSystem): ReadonlyMap<string, string> {
  dictionaries[system] ??= build(system);
  return dictionaries[system];
}

// Carry the source word's case onto its replacement: "Colour" -> "Color",
// "COLOUR" -> "COLOR". Anything else (mixed case, a product name like
// "iOrganise") is left alone by the caller.
function matchCase(source: string, replacement: string): string | null {
  if (source === source.toLowerCase()) return replacement;
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return null;
}

const WORD = /[A-Za-z]+/g;

// A word that is part of a domain, path or address ("colour.com",
// "/theatre", "centre@...") is an identifier, not prose, so it keeps its
// spelling.
function isIdentifier(text: string, start: number, end: number): boolean {
  const before = text[start - 1];
  const after = text[end];
  if (before === '.' || before === '/' || before === '@' || before === '_') return true;
  if (after === '@' || after === '/' || after === '_') return true;
  return after === '.' && /[A-Za-z0-9]/.test(text[end + 1] ?? '');
}

/**
 * Rewrite `text` into a spelling system, from British or American. Returns
 * the input unchanged (the same string) when nothing matched, so a caller can
 * compare by identity to skip a DOM write.
 */
export function localiseSpelling(text: string, system: SpellingSystem): string {
  const dictionary = spellingDictionary(system);
  let changed = false;
  const result = text.replace(WORD, (word: string, offset: number) => {
    const replacement = dictionary.get(word.toLowerCase());
    if (!replacement || isIdentifier(text, offset, offset + word.length)) return word;
    const cased = matchCase(word, replacement);
    if (cased === null) return word;
    changed = true;
    return cased;
  });
  return changed ? result : text;
}
