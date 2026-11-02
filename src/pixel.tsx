import type { AvatarSpec } from "../shared/types";

// Hand-made 8-bit pixel art: sprites are strings of palette keys, rendered as crisp SVG paths.
// "." is transparent; every other character looks up a colour in the sprite's palette.

export type Palette = Record<string, string>;
export type Rows = readonly string[];

const pathCache = new Map<Rows, Record<string, string>>();

// One <path> per colour, with horizontal runs merged, keeps the DOM small.
function buildPaths(rows: Rows): Record<string, string> {
  const cached = pathCache.get(rows);
  if (cached) return cached;
  const paths: Record<string, string> = {};
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || ch === " ") {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run++;
      paths[ch] = (paths[ch] ?? "") + `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  pathCache.set(rows, paths);
  return paths;
}

export function PixelArt(props: {
  rows: Rows;
  palette: Palette;
  x?: number;
  y?: number;
  scale?: number;
  className?: string;
  classes?: Record<string, string>;
}) {
  const paths = buildPaths(props.rows);
  return (
    <g
      className={props.className}
      transform={`translate(${props.x ?? 0} ${props.y ?? 0}) scale(${props.scale ?? 1})`}
      shapeRendering="crispEdges"
    >
      {Object.entries(paths).map(([ch, d]) =>
        props.palette[ch] ? <path key={ch} d={d} fill={props.palette[ch]} className={props.classes?.[ch]} /> : null,
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Characters (12 x 16)

const OUTLINE = "#1a1c2c";

const BASE_BODY: Rows = [
  "....OOOO....",
  "...OHHHHO...",
  "..OHHHHHHO..",
  "..OHSSSSHO..",
  "..OSESSESO..",
  "..OSSSSSSO..",
  "...OSSSSO...",
  "..OCCCCCCO..",
  ".OCCCCCCCCO.",
  ".OSCCCCCCSO.",
  "..OCCCCCCO..",
  "..OPPPPPPO..",
  "..OPPOOPPO..",
  "..OPPOOPPO..",
  "..OBBOOBBO..",
  "..OOOOOOOO..",
];

const LEGS_WALK_A: Rows = ["..OPPOOPPO..", ".OPPO..OPPO.", ".OBBO..OBBO.", ".OOO....OOO."];
const LEGS_WALK_B: Rows = ["..OPPPPPPO..", "...OPPPPO...", "...OBBBBO...", "...OOOOOO..."];

type Look = "short" | "long" | "spiky" | "bun" | "slick" | "hood" | "glasses" | "tie" | "headset";

// Row overrides applied on top of the base body, in order.
const LOOKS: Record<Look, Record<number, string>> = {
  short: {},
  long: { 4: ".OHSESSESHO.", 5: ".OHSSSSSSHO.", 6: ".OHOSSSSOHO.", 7: ".OHCCCCCCHO." },
  spiky: { 0: "...O.OO.O...", 1: "..OHOHHOHO.." },
  bun: { 0: "....OHHO...." },
  slick: { 3: "..OHHSSSSO.." },
  hood: {
    1: "...OCCCCO...",
    2: "..OCCCCCCO..",
    3: "..OCssssCO..",
    4: "..OCEssECO..",
    5: "..OCssssCO..",
    6: "...OCCCCO...",
  },
  glasses: { 4: "..OGEGGEGO.." },
  tie: { 7: "..OCCAACCO..", 8: ".OCCCAACCCO.", 9: ".OSCCAACCSO.", 10: "..OCCAACCO.." },
  headset: { 0: "...AOOOOA...", 1: "..AOHHHHOA..", 2: ".AOHHHHHHOA.", 3: ".AOHSSSSHOA.", 4: ".AOSESSESO.." },
};

interface CharacterSpec {
  looks: Look[];
  palette: Palette;
}

const SHARED: Palette = { O: OUTLINE, E: OUTLINE, B: "#3b2a20", G: "#9fd3ff" };

// Employees are generated per company and arrive with their own recipe (registerCharacters).
const CHARACTERS: Record<string, CharacterSpec> = {
  ceo: { looks: ["slick", "tie"], palette: { H: "#333c57", S: "#f2c49b", C: "#262b44", A: "#ffcd75", P: "#1f2335" } },
  hacker: { looks: ["hood"], palette: { C: "#29203a", s: "#11101a", E: "#ff004d", S: "#11101a", P: "#1a1c2c", B: "#11101a" } },
};

// Called with each new game state; only changed recipes are replaced.
export function registerCharacters(people: { id: string; avatar?: AvatarSpec }[]): void {
  for (const person of people) {
    if (!person.avatar) continue;
    const spec: CharacterSpec = {
      looks: person.avatar.looks.filter((l): l is Look => l in LOOKS),
      palette: person.avatar.palette,
    };
    if (JSON.stringify(CHARACTERS[person.id]) === JSON.stringify(spec)) continue;
    CHARACTERS[person.id] = spec;
    frameCache.delete(person.id);
  }
}

export interface CharacterFrames {
  idle: Rows;
  walkA: Rows;
  walkB: Rows;
  portrait: Rows;
  palette: Palette;
}

const frameCache = new Map<string, CharacterFrames>();

export function characterFrames(id: string): CharacterFrames {
  const cached = frameCache.get(id);
  if (cached) return cached;
  const spec = CHARACTERS[id] ?? CHARACTERS.ceo;
  const idle = [...BASE_BODY];
  for (const look of spec.looks) {
    for (const [row, text] of Object.entries(LOOKS[look])) idle[Number(row)] = text;
  }
  const frames: CharacterFrames = {
    idle,
    walkA: [...idle.slice(0, 12), ...LEGS_WALK_A],
    walkB: [...idle.slice(0, 12), ...LEGS_WALK_B],
    portrait: idle.slice(0, 12),
    palette: { ...SHARED, ...spec.palette },
  };
  frameCache.set(id, frames);
  return frames;
}

export function shirtColor(id: string): string {
  return CHARACTERS[id]?.palette.C ?? "#888";
}

// ---------------------------------------------------------------------------
// Chat avatars (12 x 12)

const ROBOT: Rows = [
  ".....OA.....",
  ".....O......",
  "..OOOOOOOO..",
  "..OMMMMMMO..",
  "..OMEMMEMO..",
  "..OMMMMMMO..",
  "..OMDDDDMO..",
  "..OOOOOOOO..",
  "...OMMMMO...",
  "..OMMMMMMO..",
  "..OMMAAMMO..",
  "..OOOOOOOO..",
];

const WARNING: Rows = [
  ".....OO.....",
  "....OYYO....",
  "....OYYO....",
  "...OYOOYO...",
  "...OYOOYO...",
  "..OYYOOYYO..",
  "..OYYOOYYO..",
  ".OYYYYYYYYO.",
  ".OYYYOOYYYO.",
  "OYYYYYYYYYYO",
  "OOOOOOOOOOOO",
  "............",
];

const AVATARS: Record<string, { rows: Rows; palette: Palette; bg: string }> = {
  secbot: { rows: ROBOT, palette: { O: OUTLINE, A: "#ff004d", M: "#94b0c2", E: "#41f6f6", D: "#333c57" }, bg: "#1f2a33" },
  system: { rows: WARNING, palette: { O: OUTLINE, Y: "#ffcd75" }, bg: "#2a2620" },
};

export function PixelAvatar({ id, size = 36 }: { id: string; size?: number }) {
  const special = AVATARS[id];
  const frames = special ? null : characterFrames(id);
  const bg = special?.bg ?? "#2b2f3a";
  return (
    <svg className="pixel-avatar" viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <rect width={12} height={12} fill={bg} />
      {special ? (
        <PixelArt rows={special.rows} palette={special.palette} />
      ) : (
        <PixelArt rows={frames!.portrait} palette={frames!.palette} y={0.5} />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mood bubbles (7 x 8): the model answers with an emoji; we show a pixel icon instead.

const BUBBLE: Rows = [".OOOOO.", "OWWWWWO", "OWWWWWO", "OWWWWWO", "OWWWWWO", "OWWWWWO", ".OOOOO.", "..O...."];

const GLYPHS: Record<string, { rows: Rows; color: string }> = {
  alarm: { rows: ["..X..", "..X..", "..X..", ".....", "..X.."], color: "#ff004d" },
  angry: { rows: ["X...X", ".X.X.", ".....", ".X.X.", "X...X"], color: "#ff004d" },
  sleepy: { rows: ["XXXX.", "..X..", ".X...", "XXXX.", "....."], color: "#566c86" },
  happy: { rows: [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."], color: "#ff77a8" },
  sad: { rows: ["..X..", "..X..", ".XXX.", ".XXX.", "..X.."], color: "#29adff" },
  sneaky: { rows: [".....", ".....", "X.X.X", ".....", "....."], color: "#333c57" },
  question: { rows: [".XXX.", "....X", "..XX.", ".....", "..X.."], color: "#3b5dc9" },
  idea: { rows: [".XXX.", "XXXXX", ".XXX.", ".OOO.", "..O.."], color: "#ffcd75" },
};

const MOOD_EMOJI: [string, string[]][] = [
  ["alarm", ["😱", "😨", "🚨", "😰", "😬", "🙀", "⚠", "🔥", "💥"]],
  ["angry", ["😠", "😡", "😤", "🤬", "💢"]],
  ["sleepy", ["😴", "😪", "😫", "😩", "😵", "😮‍💨", "🥱", "😑"]],
  ["sad", ["😢", "😭", "😟", "🥺", "😞", "😔"]],
  ["sneaky", ["😏", "😒", "🙄", "🤫", "😈"]],
  ["question", ["🤔", "😕", "😅", "🤨", "❓", "😳", "🫠"]],
  ["idea", ["🤓", "🧐", "💡", "💻"]],
  ["happy", ["🙂", "😊", "😄", "😁", "🥳", "🤩", "😍", "❤", "🥰", "😀", "😆", "✨", "💪", "😎"]],
];

export function moodKind(mood: string): string | null {
  for (const [kind, emojis] of MOOD_EMOJI) if (emojis.some((e) => mood.includes(e))) return kind;
  return null;
}

const glyphCache = new Map<string, Rows>();

export function MoodIcon({ mood, x, y }: { mood: string; x: number; y: number }) {
  const kind = moodKind(mood);
  if (!kind) return null;
  const glyph = GLYPHS[kind];
  let rows = glyphCache.get(kind);
  if (!rows) {
    rows = BUBBLE.map((row, r) =>
      r >= 1 && r <= 5 ? row[0] + glyph.rows[r - 1].replace(/\./g, "W") + row[6] : row,
    );
    glyphCache.set(kind, rows);
  }
  return <PixelArt rows={rows} palette={{ O: OUTLINE, W: "#fff1e8", X: glyph.color }} x={x} y={y} scale={3} />;
}

// ---------------------------------------------------------------------------
// Furniture

function box(width: number, height: number, fill: string, shade?: string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    if (y === 0 || y === height - 1) rows.push("O".repeat(width));
    else rows.push("O" + (shade && y === height - 2 ? shade : fill).repeat(width - 2) + "O");
  }
  return rows;
}

export const DESK: Rows = [
  "......OOOOOOOO......",
  "......OMMMMMMO......",
  "......OMmMMMMO......",
  "......OMMMMMMO......",
  "......OOOOOOOO......",
  "........OKKO........",
  "OOOOOOOOOOOOOOOOOOOO",
  "OWWWWWWWWWWWWWWWWWWO",
  "OwwwwwwwwwwwwwwwwwwO",
  "OOOOOOOOOOOOOOOOOOOO",
  ".Ow..............wO.",
  ".OO..............OO.",
];
export const DESK_PALETTE: Palette = { O: OUTLINE, M: "#41a6f6", m: "#a6e3ff", K: "#566c86", W: "#a0714f", w: "#7a5236" };

export const RACK: Rows = [
  "OOOOOOOOOOOO",
  ...Array.from({ length: 6 }, () => ["OkkkkkkkkkkO", "OkLkLkkkMMkO", "OKKKKKKKKKKO"]).flat(),
  "OOOOOOOOOOOO",
];
export const RACK_PALETTE: Palette = { O: OUTLINE, k: "#262b44", K: "#3a4466", M: "#566c86", L: "#38b764" };

export const PLANT: Rows = [
  "..G..G..",
  ".GGGGGG.",
  "GGgGGgGG",
  ".GGGGGG.",
  "..GgGG..",
  "...GG...",
  "..OOOO..",
  ".OTTTTO.",
  ".OTTTTO.",
  "..OTTO..",
  "..OOOO..",
];
export const PLANT_PALETTE: Palette = { O: OUTLINE, G: "#38b764", g: "#257179", T: "#b86f50" };

export const COFFEE: Rows = [
  "OOOOOOOOOO",
  "OKKKKKKKKO",
  "OKRKKKKGKO",
  "OKKKKKKKKO",
  "OKKOOOOKKO",
  "OKKO..OKKO",
  "OKKO..OKKO",
  "OKKOWWOKKO",
  "OKKOWWOKKO",
  "OKKKKKKKKO",
  "OOOOOOOOOO",
];
export const COFFEE_PALETTE: Palette = { O: OUTLINE, K: "#566c86", R: "#ff004d", G: "#38b764", W: "#fff1e8" };

function legs(width: number): string {
  return ".OO" + ".".repeat(width - 6) + "OO.";
}

export const SOFA: Rows = [...box(30, 4, "G"), ...box(30, 5, "G", "g"), legs(30)];
export const SOFA_PALETTE: Palette = { O: OUTLINE, G: "#3d8a5a", g: "#2a6345" };

export const TABLE: Rows = [...box(44, 10, "W", "w"), legs(44)];
export const TABLE_PALETTE: Palette = { O: OUTLINE, W: "#a0714f", w: "#7a5236" };

export const WHITEBOARD: Rows = [
  "O".repeat(34),
  "O" + "W".repeat(32) + "O",
  "O" + "W" + "R".repeat(7) + "W".repeat(6) + "B".repeat(10) + "W".repeat(8) + "O",
  "O" + "W".repeat(26) + "G".repeat(5) + "W" + "O",
  "O" + "W" + "B".repeat(5) + "W".repeat(26) + "O",
  "O" + "W".repeat(32) + "O",
  "O".repeat(34),
];
export const WHITEBOARD_PALETTE: Palette = { O: OUTLINE, W: "#f4f4f4", R: "#ff004d", B: "#3b5dc9", G: "#38b764" };

export const TV: Rows = [...box(18, 9, "M"), "......OOOOOO......"];
export const TV_PALETTE: Palette = { O: OUTLINE, M: "#29366f" };

export const COUNTER: Rows = box(80, 9, "W", "w");
export const COUNTER_PALETTE: Palette = { O: OUTLINE, W: "#c2c3c7", w: "#8b8c94" };

export const BIG_DESK: Rows = [
  "...........OOOOOOOOOO.........",
  "...........OMMMMMMMMO.........",
  "...........OMmMMMMMMO.........",
  "...........OOOOOOOOOO.........",
  "..............OKKO............",
  ...box(30, 7, "W", "w"),
  legs(30),
];
export const BIG_DESK_PALETTE: Palette = { ...DESK_PALETTE, W: "#8a4f3a", w: "#5f3426" };

// ---------------------------------------------------------------------------
// Workstations for other kinds of business (same 20 x 12 footprint as DESK)

export const STOVE: Rows = [
  "...OOOO......OOOO...",
  "..ORRRRO....OKKKKO..",
  "..ORRRRO....OKKKKO..",
  "...OOOO......OOOO...",
  "OOOOOOOOOOOOOOOOOOOO",
  "OSSSSSSSSSSSSSSSSSSO",
  "OsKKsKKsssssKKsKKssO",
  "OSSSSSSSSSSSSSSSSSSO",
  "OSSOOOOSSSSSSOOOOSSO",
  "OSSOFFOSSSSSSOFFOSSO",
  "OSSOOOOSSSSSSOOOOSSO",
  "OOOOOOOOOOOOOOOOOOOO",
];
export const STOVE_PALETTE: Palette = { O: OUTLINE, R: "#b13e53", K: "#333c57", S: "#c2c3c7", s: "#8b8c94", F: "#ef7d57" };

export const DENTAL_CHAIR: Rows = [
  "..............OOO...",
  "..............OYO...",
  "...............O....",
  "...............O....",
  "OO.............O....",
  "OCO............O....",
  "OCCOOOOOOOOOOO.O....",
  "OCCCCCCCCCCCCCO.....",
  ".OCCCCCCCCCCCO......",
  "......OKKO..........",
  ".....OKKKKO.........",
  "....OOOOOOOO........",
];
export const DENTAL_CHAIR_PALETTE: Palette = { O: OUTLINE, C: "#41a6a6", Y: "#ffcd75", K: "#566c86" };

export const MACHINE: Rows = [
  "OOOOOOOOOOOOOOOOOOOO",
  "OYYYYYYYYYYYYYYYYYYO",
  "OYKKKKKKKKKKKKKKKKYO",
  "OYKMMMMKKKKKKLLKKKYO",
  "OYKMmmMKKKKKKKKKKKYO",
  "OYKMMMMKKKKKKRRKKKYO",
  "OYKKKKKKKKKKKKKKKKYO",
  "OYYYYYYYYYYYYYYYYYYO",
  "OOOOOOOOOOOOOOOOOOOO",
  "OGGGGGGGGGGGGGGGGGGO",
  "OgOgOgOgOgOgOgOgOgOO",
  "OOOOOOOOOOOOOOOOOOOO",
];
export const MACHINE_PALETTE: Palette = {
  O: OUTLINE,
  Y: "#ffcd75",
  K: "#3a4466",
  M: "#41a6f6",
  m: "#a6e3ff",
  L: "#38b764",
  R: "#ff004d",
  G: "#566c86",
  g: "#333c57",
};

export const BED: Rows = [
  "OOOO................",
  "OWWOOOOOOOOOOOOOOOOO",
  "OWWOPPPPPPPPPPPPPPPO",
  "OWWOPPPPPPPPPPPPPPPO",
  "OWWOBBBBBBBBBBBBBBBO",
  "OWWOBBBBBBBBBBBBBBBO",
  "OWWObbbbbbbbbbbbbbbO",
  "OOOOOOOOOOOOOOOOOOOO",
  "OwwwwwwwwwwwwwwwwwwO",
  "OOOOOOOOOOOOOOOOOOOO",
  ".OO..............OO.",
  "....................",
];
export const BED_PALETTE: Palette = { O: OUTLINE, W: "#a0714f", w: "#7a5236", P: "#fff1e8", B: "#3b5dc9", b: "#29366f" };

export const PLANTER: Rows = [
  "..G...G...G...G...G.",
  ".GGG.GGG.GGG.GGG.GGG",
  "GGgGGGgGGGgGGGgGGGgG",
  ".GG..GG..GG..GG..GG.",
  "OOOOOOOOOOOOOOOOOOOO",
  "OTTTTTTTTTTTTTTTTTTO",
  "OttttttttttttttttttO",
  "OTTTTTTTTTTTTTTTTTTO",
  "OOOOOOOOOOOOOOOOOOOO",
  "BBBBBBBBBBBBBBBBBBBB",
  "...O..........O.....",
  "..OLO........OLO....",
];
export const PLANTER_PALETTE: Palette = { O: OUTLINE, G: "#38b764", g: "#257179", T: "#7a5236", t: "#5d3a1a", B: "#41a6f6", L: "#ffcd75" };

export const SHELF: Rows = [
  "OOOOOOOOOOOOOOOOOOOO",
  "OBBBBOAAAAOBBBBOAAAO",
  "OBBBBOAAAAOBBBBOAAAO",
  "OOOOOOOOOOOOOOOOOOOO",
  "OAAAOBBBBBOAAAOBBBBO",
  "OAAAOBBBBBOAAAOBBBBO",
  "OOOOOOOOOOOOOOOOOOOO",
  "OBBBBBOAAAAAOBBBBBBO",
  "OBBBBBOAAAAAOBBBBBBO",
  "OOOOOOOOOOOOOOOOOOOO",
  "O..................O",
  "OO................OO",
];
export const SHELF_PALETTE: Palette = { O: OUTLINE, B: "#b86f50", A: "#ef7d57" };
// Parcel lockers: the same frame with grey doors.
export const LOCKER_PALETTE: Palette = { O: OUTLINE, B: "#94b0c2", A: "#566c86" };

export const TREADMILL: Rows = [
  "..............OOO...",
  "..............OMO...",
  "..............OOO...",
  "...............O....",
  "...............O....",
  "...............O....",
  "OOOOOOOOOOOOOOOOO...",
  "OKKKKKKKKKKKKKKKO...",
  "OkkkkkkkkkkkkkkkOO..",
  "OOOOOOOOOOOOOOOOOOO.",
  ".OO............OO...",
  "....................",
];
export const TREADMILL_PALETTE: Palette = { O: OUTLINE, M: "#41a6f6", K: "#333c57", k: "#566c86" };

export const CRATE: Rows = box(12, 8, "B", "b");
export const CRATE_PALETTE: Palette = { O: OUTLINE, B: "#b86f50", b: "#7a5236" };

export const POOL: Rows = box(64, 22, "W", "w");
export const POOL_PALETTE: Palette = { O: "#c2c3c7", W: "#41a6f6", w: "#29adff" };
