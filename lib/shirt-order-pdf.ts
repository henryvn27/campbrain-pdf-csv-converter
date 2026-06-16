import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ParsedCamper, ShirtCount } from "./campbrain-parser";

type ShirtOrderPdfInput = {
  counts: ShirtCount[];
  newCampers: ParsedCamper[];
  previousCount: number;
  currentCount: number;
  previousFiles: string[];
  currentFile: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const INK = rgb(0.06, 0.13, 0.1);
const MUTED = rgb(0.36, 0.42, 0.38);
const LINE = rgb(0.78, 0.81, 0.76);
const EMERALD = rgb(0.02, 0.32, 0.24);
const STONE = rgb(0.97, 0.96, 0.93);

type DrawContext = {
  doc: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

function totalCount(counts: ShirtCount[]) {
  return counts.reduce((sum, count) => sum + count.count, 0);
}

function byCabin(counts: ShirtCount[]) {
  const grouped = new Map<string, ShirtCount[]>();

  for (const count of counts) {
    grouped.set(count.cabin, [...(grouped.get(count.cabin) ?? []), count]);
  }

  return grouped;
}

function campersByCabin(campers: ParsedCamper[]) {
  const grouped = new Map<string, ParsedCamper[]>();

  for (const camper of campers) {
    grouped.set(camper.cabin, [...(grouped.get(camper.cabin) ?? []), camper]);
  }

  return grouped;
}

function sizeSummary(counts: ShirtCount[]) {
  return counts.map((count) => `${count.tshirtSize}: ${count.count}`).join(" / ");
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let fitted = text;
  while (fitted.length > 3 && font.widthOfTextAtSize(`${fitted}...`, size) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted.trimEnd()}...`;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; maxWidth?: number }
) {
  page.drawText(options.maxWidth ? fitText(text, options.font, options.size, options.maxWidth) : text, {
    x,
    y,
    size: options.size,
    font: options.font,
    color: options.color ?? INK
  });
}

function addPage(ctx: DrawContext) {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: DrawContext, height: number) {
  if (ctx.y - height < MARGIN) addPage(ctx);
}

function drawRule(ctx: DrawContext, y = ctx.y, color = LINE) {
  ctx.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.8,
    color
  });
}

function drawHeader(ctx: DrawContext, input: ShirtOrderPdfInput) {
  drawText(ctx.page, "Shirt checklist", MARGIN, ctx.y, {
    font: ctx.bold,
    size: 24
  });
  drawText(ctx.page, `Generated ${new Date().toLocaleDateString()}`, PAGE_WIDTH - MARGIN - 120, ctx.y + 3, {
    font: ctx.regular,
    size: 8,
    color: MUTED,
    maxWidth: 120
  });
  ctx.y -= 28;
  drawRule(ctx, ctx.y, EMERALD);
  ctx.y -= 18;

  const total = totalCount(input.counts);
  drawText(ctx.page, `${total} shirts needed`, MARGIN, ctx.y, {
    font: ctx.bold,
    size: 12
  });
  drawText(ctx.page, `${input.currentCount} current campers / ${input.previousCount} previous records`, MARGIN + 130, ctx.y, {
    font: ctx.regular,
    size: 10,
    color: MUTED,
    maxWidth: 250
  });
  ctx.y -= 15;
  drawText(ctx.page, `Current: ${input.currentFile || "Current week PDF"}`, MARGIN, ctx.y, {
    font: ctx.regular,
    size: 8.5,
    color: MUTED,
    maxWidth: PAGE_WIDTH - MARGIN * 2
  });
  ctx.y -= 12;
  drawText(ctx.page, `Previous: ${input.previousFiles.join(", ") || "Previous camper PDFs"}`, MARGIN, ctx.y, {
    font: ctx.regular,
    size: 8.5,
    color: MUTED,
    maxWidth: PAGE_WIDTH - MARGIN * 2
  });
  ctx.y -= 24;
}

function drawChecklist(ctx: DrawContext, campers: ParsedCamper[], counts: ShirtCount[]) {
  if (campers.length === 0) return;

  const columns = [
    { label: "Done", x: MARGIN, width: 48 },
    { label: "Name", x: MARGIN + 58, width: 230 },
    { label: "Size", x: MARGIN + 300, width: 95 },
    { label: "Cabin", x: MARGIN + 410, width: 112 }
  ];
  const countGroups = byCabin(counts);
  const camperGroups = campersByCabin(campers);

  function drawTableHeader() {
    ensureSpace(ctx, 30);
    ctx.page.drawRectangle({
      x: MARGIN,
      y: ctx.y - 20,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 22,
      color: STONE,
      borderColor: LINE,
      borderWidth: 0.5
    });
    for (const column of columns) {
      drawText(ctx.page, column.label.toUpperCase(), column.x + 8, ctx.y - 13, {
        font: ctx.regular,
        size: 7,
        color: MUTED,
        maxWidth: column.width
      });
    }
    ctx.y -= 36;
  }

  for (const [cabin, cabinCampers] of camperGroups) {
    const cabinCounts = countGroups.get(cabin) ?? [];
    const cabinTotal = cabinCampers.length;
    ensureSpace(ctx, 92);

    drawText(ctx.page, cabin, MARGIN, ctx.y, { font: ctx.bold, size: 13, color: EMERALD });
    drawText(ctx.page, `${cabinTotal} total`, PAGE_WIDTH - MARGIN - 78, ctx.y, {
      font: ctx.bold,
      size: 10,
      color: EMERALD,
      maxWidth: 68
    });
    ctx.y -= 14;
    drawRule(ctx, ctx.y);
    ctx.y -= 15;

    if (cabinCounts.length > 0) {
      drawText(ctx.page, sizeSummary(cabinCounts), MARGIN, ctx.y, {
        font: ctx.regular,
        size: 9,
        color: MUTED,
        maxWidth: PAGE_WIDTH - MARGIN * 2
      });
      ctx.y -= 16;
    }

    drawTableHeader();

    for (const camper of cabinCampers) {
      ensureSpace(ctx, 30);
      if (ctx.y > PAGE_HEIGHT - MARGIN - 5) drawTableHeader();

      ctx.page.drawRectangle({
        x: columns[0].x + 12,
        y: ctx.y - 5,
        width: 11,
        height: 11,
        borderColor: INK,
        borderWidth: 0.8
      });
      drawText(ctx.page, `${camper.lastName}, ${camper.firstName}`, columns[1].x + 8, ctx.y - 1, {
        font: ctx.regular,
        size: 9,
        maxWidth: columns[1].width
      });
      drawText(ctx.page, camper.tshirtSize || "Missing size", columns[2].x + 8, ctx.y - 1, {
        font: ctx.regular,
        size: 9,
        maxWidth: columns[2].width
      });
      drawText(ctx.page, camper.cabin, columns[3].x + 8, ctx.y - 1, {
        font: ctx.regular,
        size: 9,
        maxWidth: columns[3].width
      });
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y - 13 },
        end: { x: PAGE_WIDTH - MARGIN, y: ctx.y - 13 },
        thickness: 0.3,
        color: LINE
      });
      ctx.y -= 25;
    }

    ctx.y -= 22;
  }
}

function drawPageNumbers(ctx: DrawContext) {
  const pages = ctx.doc.getPages();

  pages.forEach((page, index) => {
    drawText(page, `Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN - 70, 24, {
      font: ctx.regular,
      size: 8,
      color: MUTED
    });
  });
}

export async function createShirtOrderPdf(input: ShirtOrderPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const ctx: DrawContext = {
    doc,
    page,
    regular,
    bold,
    y: PAGE_HEIGHT - MARGIN
  };

  drawHeader(ctx, input);
  drawChecklist(ctx, input.newCampers, input.counts);
  drawPageNumbers(ctx);

  return doc.save();
}
