// Filtro de palabras ofensivas para los mensajes públicos: compara cada palabra con una lista de
// insultos y tapa las que coinciden con asteriscos ("p****"). Es una lista, no un modelo: no entiende
// el contexto, pero es instantáneo. Para sumar palabras alcanza con agregarlas abajo.

// Palabras que se tapan solo si coinciden enteras (con plural o variantes escritas aparte).
const WORDS = [
  "puto", "puta", "putos", "putas", "putito", "putita", "trolo", "trola", "trolos", "trolas",
  "forro", "forra", "forros", "forras", "garca", "garcas", "gil", "giles", "choto", "chota",
  "pija", "pijas", "verga", "vergas", "culo", "culos", "orto", "ojete", "sorete", "soretes",
  "carajo", "cagon", "cagona", "cagones", "cagada", "idiota", "idiotas", "mamerto", "mamertos",
  "villero", "villera", "villeros", "villeras", "hdp", "lpm", "lpmqtp", "lpqtp", "ptm", "ctm",
];

// Raíces: se tapa cualquier palabra que empiece así ("pelotud" → pelotudo, pelotudez, pelotudos).
const STEMS = [
  "pelotud", "bolud", "mierd", "conchud", "culiad", "porong", "imbecil", "estupid", "tarad",
  "mogolic", "malparid", "pajer", "turr", "maricon", "hijodeput", "hijueput", "chupapij", "chupaverg",
];

// Palabras comunes que, al normalizarlas, quedarían igual que un insulto (sin acentos).
const ALLOWED = new Set(["foro", "foros", "turron", "turrones"]);

const LEET: Record<string, string> = { "4": "a", "@": "a", "3": "e", "1": "i", "!": "i", "0": "o", "5": "s", $: "s", "7": "t" };

const stripAccents = (word: string) => word.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Minúsculas, sin acentos, sin "leet" (put4 → puta) y sin letras repetidas (putaaa → puta).
function normalize(word: string) {
  return stripAccents(word)
    .replace(/[4@31!05$7]/g, (char) => LEET[char])
    .replace(/(.)\1+/g, "$1");
}

const WORD_SET = new Set(WORDS.map(normalize));
const STEM_LIST = STEMS.map(normalize);

function isOffensive(word: string) {
  if (ALLOWED.has(stripAccents(word))) return false;
  const normalized = normalize(word);
  return WORD_SET.has(normalized) || STEM_LIST.some((stem) => normalized.startsWith(stem));
}

const mask = (word: string) => word[0] + "*".repeat(word.length - 1);

// Devuelve el texto con los insultos tapados.
export function sanitize(text: string) {
  return text.replace(/[\p{L}\p{N}@$!]+/gu, (word) => (isOffensive(word) ? mask(word) : word));
}

// Los bots de spam casi siempre dejan enlaces: en los mensajes públicos no se aceptan.
export function hasLink(text: string) {
  return /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ar|info|xyz|ru|io|link|site|online)\b)/i.test(text);
}
