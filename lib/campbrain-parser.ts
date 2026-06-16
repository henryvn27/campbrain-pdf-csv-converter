export type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

export type TextRow = {
  page: number;
  y: number;
  text: string;
  parts: Array<{ str: string; x: number; y: number }>;
};

export type ParsedCamper = {
  cabin: string;
  lastName: string;
  firstName: string;
  tshirtSize: string;
};

export type ShirtCount = {
  cabin: string;
  tshirtSize: string;
  count: number;
};

const CLASSROOMS = [
  { label: "Mini Camp", match: "Mini Camp" },
  { label: "B&B - 1", match: "B&B 1" },
  { label: "B&B-2", match: "B&B 2" },
  { label: "B&B-3", match: "B&B 3" },
  { label: "Vipers-1", match: "Vipers 1" },
  { label: "Vipers 2", match: "Vipers 2" },
  { label: "Pythons", match: "Pythons" },
  { label: "Constrictors", match: "Constrictors" },
  { label: "Junior High", match: "Junior High" }
] as const;

const VALID_SIZES = [
  "Youth XS",
  "Youth S",
  "Youth M",
  "Youth L",
  "Adult S",
  "Adult M",
  "Adult L",
  "Adult XL"
] as const;

const HEADER_NOISE = /\b(People|T-Shirt\s*Size|Camper|Cabin|Birthdate|Age|Grade|Gender|Session|Program|Page\s+\d+)\b/i;
const SIZE_PATTERN = "(?:Youth\\s+XS|Youth\\s+S|Youth\\s+M|Youth\\s+L|Adult\\s+XL|Adult\\s+S|Adult\\s+M|Adult\\s+L)";
const SIZE_RE = new RegExp(`\\b${SIZE_PATTERN}\\b`, "i");
const GLOBAL_SIZE_RE = new RegExp(`\\b${SIZE_PATTERN}\\b`, "gi");

// Supports names like: Bejar, Levi | Joiner-Clark, Sora | O'Neil, Mary Kate | De La Cruz, Ana
const BLOCKED_NAME_WORDS = "(?:Youth|Adult|People|Camper|Cabin|Age|Grade|Gender|Session|Program|Male|Female|Nonbinary|T-Shirt|Size)";
const NAME_WORD = `(?!${BLOCKED_NAME_WORDS}\\b)[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.\\-]*`;
const NAME_RE = new RegExp(`\\b(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3}),\\s+(${NAME_WORD}(?:\\s+${NAME_WORD}){0,2})\\b`, "g");

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: string): string {
  return normalizeSpaces(value)
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/&amp;/g, "&")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classroomPattern(classroom: string): RegExp {
  const escaped = escapeRegExp(normalizeComparable(classroom));
  const loose = escaped
    .replace(/-/g, "[-\\s]*")
    .replace(/ /g, "[-\\s]+");
  return new RegExp(`(?:^|\\b)${loose}(?:\\s*\\([^)]*\\))?(?:\\b|$)`, "i");
}

function canonicalCabinName(rowText: string): string | null {
  const normalizedRow = normalizeComparable(rowText);

  for (const classroom of CLASSROOMS) {
    if (classroomPattern(classroom.match).test(normalizedRow)) return classroom.label;
  }

  return null;
}

function canonicalSize(value: string): string {
  const normalized = normalizeSpaces(value).toLowerCase();
  const match = VALID_SIZES.find((size) => size.toLowerCase() === normalized);
  return match ?? normalizeSpaces(value);
}

function normalizeIdentityPart(value: string): string {
  return normalizeSpaces(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

function hasHeaderNoise(text: string): boolean {
  return HEADER_NOISE.test(text);
}

export function buildRowsFromTextItems(page: number, items: PdfTextItem[], yTolerance = 3): TextRow[] {
  const positioned = items
    .map((item) => ({
      str: normalizeSpaces(item.str),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0)
    }))
    .filter((item) => item.str.length > 0)
    .sort((a, b) => (Math.abs(b.y - a.y) > yTolerance ? b.y - a.y : a.x - b.x));

  const rows: TextRow[] = [];

  for (const item of positioned) {
    const existing = rows.find((row) => Math.abs(row.y - item.y) <= yTolerance);
    if (existing) {
      existing.parts.push(item);
      existing.y = (existing.y * (existing.parts.length - 1) + item.y) / existing.parts.length;
    } else {
      rows.push({ page, y: item.y, text: "", parts: [item] });
    }
  }

  return rows
    .map((row) => {
      const parts = row.parts.sort((a, b) => a.x - b.x);
      return {
        ...row,
        parts,
        text: normalizeSpaces(parts.map((part) => part.str).join(" "))
      };
    })
    .filter((row) => row.text.length > 0)
    .sort((a, b) => (a.page === b.page ? b.y - a.y : a.page - b.page));
}

function maskSizes(text: string): string {
  return text.replace(GLOBAL_SIZE_RE, (match) => " ".repeat(match.length));
}

function findNearestSize(row: TextRow, nameStartIndex: number, nameEndIndex: number): string {
  const rowText = row.text;
  const afterName = rowText.slice(nameEndIndex, Math.min(rowText.length, nameEndIndex + 80));
  const beforeName = rowText.slice(Math.max(0, nameStartIndex - 40), nameStartIndex);
  const nearbyText = `${afterName} ${beforeName}`;
  const nearbyMatch = nearbyText.match(SIZE_RE);
  if (nearbyMatch) return canonicalSize(nearbyMatch[0]);

  const fullRowMatch = rowText.match(SIZE_RE);
  if (fullRowMatch) return canonicalSize(fullRowMatch[0]);

  // Fallback: use text-position proximity when the size and name are split into separate PDF text items.
  const nameLikeX = row.parts.find((part) => rowText.includes(part.str) && part.str.includes(","))?.x;
  const sizeParts = row.parts.filter((part) => SIZE_RE.test(part.str));
  if (typeof nameLikeX === "number" && sizeParts.length > 0) {
    const nearest = sizeParts.sort((a, b) => Math.abs(a.x - nameLikeX) - Math.abs(b.x - nameLikeX))[0];
    return canonicalSize(nearest.str);
  }

  return "";
}

function isLikelyMetadataRow(rowText: string): boolean {
  const text = normalizeSpaces(rowText);
  if (!text) return true;
  if (hasHeaderNoise(text) && !NAME_RE.test(text)) return true;
  NAME_RE.lastIndex = 0;
  return false;
}

export function parseCampBrainRows(rows: TextRow[]): ParsedCamper[] {
  const campers: ParsedCamper[] = [];
  let currentCabin = "";
  const seen = new Set<string>();

  for (const row of rows) {
    const rowText = normalizeSpaces(row.text);
    const cabin = canonicalCabinName(rowText);
    if (cabin) {
      currentCabin = cabin;
      continue;
    }

    if (!currentCabin || isLikelyMetadataRow(rowText)) continue;

    const nameSearchText = maskSizes(rowText);
    NAME_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = NAME_RE.exec(nameSearchText)) !== null) {
      const lastName = normalizeSpaces(match[1]);
      const firstName = normalizeSpaces(match[2]);

      if (!lastName || !firstName) continue;
      if (hasHeaderNoise(`${lastName}, ${firstName}`)) continue;

      const tshirtSize = findNearestSize(row, match.index, match.index + match[0].length);
      const key = `${currentCabin}|${lastName}|${firstName}`.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      campers.push({ cabin: currentCabin, lastName, firstName, tshirtSize });
    }
  }

  return campers;
}

function escapeCsvCell(value: string): string {
  const safe = value ?? "";
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function campersToCsv(campers: ParsedCamper[]): string {
  const header = ["Cabin", "Last Name", "First Name", "T-Shirt Size"];
  const rows = campers.map((camper) => [camper.cabin, camper.lastName, camper.firstName, camper.tshirtSize]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function parsedFileName(originalFileName: string): string {
  const base = originalFileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "_");
  return `${base || "CampBrain"}_Parsed.csv`;
}

export function camperIdentityKey(camper: Pick<ParsedCamper, "lastName" | "firstName">): string {
  return `${normalizeIdentityPart(camper.lastName)}|${normalizeIdentityPart(camper.firstName)}`;
}

export function findNewCampers(currentCampers: ParsedCamper[], previousCampers: ParsedCamper[]): ParsedCamper[] {
  const previousKeys = new Set(previousCampers.map(camperIdentityKey));
  const seenCurrent = new Set<string>();

  return currentCampers.filter((camper) => {
    const key = camperIdentityKey(camper);
    if (previousKeys.has(key) || seenCurrent.has(key)) return false;
    seenCurrent.add(key);
    return true;
  });
}

function cabinSortIndex(cabin: string): number {
  const index = CLASSROOMS.findIndex((classroom) => classroom.label === cabin);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sizeSortIndex(size: string): number {
  const index = VALID_SIZES.findIndex((validSize) => validSize === size);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function sortCampersForShirts(campers: ParsedCamper[]): ParsedCamper[] {
  return [...campers].sort((a, b) => {
    const cabinDelta = cabinSortIndex(a.cabin) - cabinSortIndex(b.cabin);
    if (cabinDelta !== 0) return cabinDelta;

    const sizeDelta = sizeSortIndex(a.tshirtSize) - sizeSortIndex(b.tshirtSize);
    if (sizeDelta !== 0) return sizeDelta;

    return `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`);
  });
}

export function summarizeShirtsByCabin(campers: ParsedCamper[]): ShirtCount[] {
  const counts = new Map<string, ShirtCount>();

  for (const camper of campers) {
    const tshirtSize = camper.tshirtSize || "Missing size";
    const key = `${camper.cabin}|${tshirtSize}`;
    const current = counts.get(key);

    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { cabin: camper.cabin, tshirtSize, count: 1 });
    }
  }

  return [...counts.values()].sort((a, b) => {
    const cabinDelta = cabinSortIndex(a.cabin) - cabinSortIndex(b.cabin);
    if (cabinDelta !== 0) return cabinDelta;

    const sizeDelta = sizeSortIndex(a.tshirtSize) - sizeSortIndex(b.tshirtSize);
    if (sizeDelta !== 0) return sizeDelta;

    return a.tshirtSize.localeCompare(b.tshirtSize);
  });
}

export function shirtCountsToCsv(counts: ShirtCount[]): string {
  const header = ["Cabin", "T-Shirt Size", "Count"];
  const rows = counts.map((count) => [count.cabin, count.tshirtSize, String(count.count)]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function newCampersToCsv(campers: ParsedCamper[]): string {
  return campersToCsv(sortCampersForShirts(campers));
}

export const parserConstants = {
  cabins: CLASSROOMS.map((classroom) => classroom.label),
  validSizes: VALID_SIZES
};
