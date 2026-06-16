"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildRowsFromTextItems,
  campersToCsv,
  findNewCampers,
  newCampersToCsv,
  parsedFileName,
  parseCampBrainRows,
  parserConstants,
  sortCampersForShirts,
  summarizeShirtsByCabin,
  type ParsedCamper,
  type PdfTextItem,
  type ShirtCount
} from "@/lib/campbrain-parser";
import { createShirtOrderPdf } from "@/lib/shirt-order-pdf";

type Mode = "single" | "weekly";
type Status = "idle" | "dragging" | "processing" | "success" | "error";

type WeeklyResult = {
  previousCount: number;
  currentCount: number;
  newCampers: ParsedCamper[];
  sortedNewCampers: ParsedCamper[];
  counts: ShirtCount[];
};

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName);
}

function downloadBytes(bytes: Uint8Array, fileName: string, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type });
  downloadBlob(blob, fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isPdf(file: File) {
  return file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
}

function fileListToArray(fileList: FileList | null | undefined): File[] {
  return Array.from(fileList ?? []).filter(isPdf);
}

async function extractRowsFromPdf(file: File) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const rows = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: false });
    rows.push(...buildRowsFromTextItems(pageNumber, content.items as PdfTextItem[]));
  }

  return rows;
}

async function extractCampersFromPdf(file: File) {
  const rows = await extractRowsFromPdf(file);
  return parseCampBrainRows(rows);
}

function countByCabin(campers: ParsedCamper[]) {
  return campers.reduce<Record<string, number>>((acc, camper) => {
    acc[camper.cabin] = (acc[camper.cabin] ?? 0) + 1;
    return acc;
  }, {});
}

function joinedFileNames(files: File[]) {
  if (files.length === 0) return "No PDFs selected";
  if (files.length === 1) return files[0].name;
  return `${files.length} PDFs selected`;
}

function uploadCardClass(hasFile: boolean) {
  return hasFile
    ? "border-emerald-800 bg-emerald-50/80 ring-1 ring-emerald-800/10"
    : "border-dashed border-stone-300 bg-[#fbfcf8]";
}

function uploadStatusPill(hasFile: boolean) {
  return hasFile
    ? "border-emerald-800/20 bg-emerald-900 text-white"
    : "border-stone-300 bg-stone-100 text-stone-700";
}

export default function Home() {
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const previousInputRef = useRef<HTMLInputElement | null>(null);
  const currentInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>("weekly");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Add previous weeks and the current week to calculate the shirt order.");
  const [lastFile, setLastFile] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedCamper[]>([]);
  const [previousFiles, setPreviousFiles] = useState<File[]>([]);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [weeklyResult, setWeeklyResult] = useState<WeeklyResult | null>(null);

  const statusTone = useMemo(() => {
    if (status === "processing") return "border-amber-300 bg-amber-50 text-amber-950";
    if (status === "success") return "border-emerald-300 bg-emerald-50 text-emerald-950";
    if (status === "error") return "border-red-300 bg-red-50 text-red-950";
    return "border-stone-300 bg-[#fbfcf8] text-stone-950";
  }, [status]);

  const singleHelperText = useMemo(() => {
    if (status === "processing" && mode === "single") return "Reading the PDF and preparing the CSV.";
    if (status === "success" && mode === "single") return "CSV downloaded. Check the preview for missing T-shirt sizes.";
    if (status === "error") return "The file stayed on this device. Try a fresh CampBrain report.";
    return "Drop one CampBrain PDF here. The CSV downloads as soon as parsing finishes.";
  }, [mode, status]);

  const byCabin = useMemo(() => countByCabin(parsed), [parsed]);
  const hasPreviousFiles = previousFiles.length > 0;
  const hasCurrentFile = Boolean(currentFile);
  const canCalculateWeekly = hasPreviousFiles && hasCurrentFile && status !== "processing";

  const processSingleFile = useCallback(async (file: File) => {
    if (!isPdf(file)) {
      setStatus("error");
      setMessage("Please upload a PDF file.");
      setParsed([]);
      return;
    }

    setStatus("processing");
    setMessage(`Processing ${file.name}...`);
    setLastFile(file.name);
    setParsed([]);
    setWeeklyResult(null);

    try {
      const campers = await extractCampersFromPdf(file);

      if (campers.length === 0) {
        throw new Error("No camper rows matched the CampBrain name/cabin rules.");
      }

      const csv = campersToCsv(campers);
      downloadCsv(csv, parsedFileName(file.name));

      const missingSizes = campers.filter((camper) => !camper.tshirtSize).length;
      setParsed(campers);
      setStatus("success");
      setMessage(
        `Parsed ${campers.length} camper${campers.length === 1 ? "" : "s"}` +
          (missingSizes ? `, with ${missingSizes} missing T-shirt size${missingSizes === 1 ? "" : "s"}.` : ".")
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not parse that PDF.");
      setParsed([]);
    }
  }, []);

  const processWeeklyFiles = useCallback(async () => {
    if (previousFiles.length === 0) {
      setStatus("error");
      setMessage("Add at least one previous or cumulative PDF.");
      return;
    }

    if (!currentFile) {
      setStatus("error");
      setMessage("Add the current week PDF.");
      return;
    }

    setStatus("processing");
    setMessage("Comparing current week against previous campers...");
    setParsed([]);
    setWeeklyResult(null);

    try {
      const previousGroups = await Promise.all(previousFiles.map(extractCampersFromPdf));
      const previousCampers = previousGroups.flat();
      const currentCampers = await extractCampersFromPdf(currentFile);

      if (currentCampers.length === 0) {
        throw new Error("No current-week camper rows matched the CampBrain name/cabin rules.");
      }

      const newCampers = findNewCampers(currentCampers, previousCampers);
      const sortedNewCampers = sortCampersForShirts(newCampers);
      const counts = summarizeShirtsByCabin(sortedNewCampers);

      setWeeklyResult({
        previousCount: previousCampers.length,
        currentCount: currentCampers.length,
        newCampers,
        sortedNewCampers,
        counts
      });
      setStatus("success");
      setMessage(
        `Found ${newCampers.length} new camper${newCampers.length === 1 ? "" : "s"} in ${currentFile.name}.`
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not compare those PDFs.");
    }
  }, [currentFile, previousFiles]);

  const onSingleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setStatus("idle");
      const file = event.dataTransfer.files?.[0];
      if (file) void processSingleFile(file);
    },
    [processSingleFile]
  );

  return (
    <main className="min-h-[100dvh] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-4xl gap-5">
        <header className="rounded-xl border border-stone-300/80 bg-[#fbfcf8]/90 p-5 shadow-soft backdrop-blur sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-4 sm:grid-cols-[4rem_1fr] sm:items-start">
              <img src="/logo.svg" alt="" aria-hidden="true" className="size-14 rounded-2xl shadow-sm sm:size-16" />
              <div>
                <h1 className="max-w-3xl text-4xl font-semibold leading-[0.95] tracking-tight text-stone-950 sm:text-5xl">
                  CampBrain shirt counts
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-stone-700">
                  Upload previous camper PDFs and the current week report. The app finds new campers, then downloads the shirt order as a PDF or CSV.
                </p>
              </div>
            </div>
            <dl className="grid min-w-[17rem] grid-cols-2 gap-3 text-sm lg:text-right">
              <div className="rounded-lg border border-emerald-900/10 bg-emerald-50 px-3 py-2">
                <dt className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-emerald-900">Files</dt>
                <dd className="mt-1 font-semibold text-emerald-950">Stay in browser</dd>
              </div>
              <div className="rounded-lg border border-emerald-900/10 bg-emerald-50 px-3 py-2">
                <dt className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-emerald-900">Order</dt>
                <dd className="mt-1 font-semibold text-emerald-950">New campers only</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="grid gap-5">
          <div className="grid grid-cols-2 rounded-xl border border-stone-300 bg-[#fbfcf8]/85 p-1 text-sm font-medium shadow-sm">
            <button
              type="button"
              aria-pressed={mode === "weekly"}
              onClick={() => setMode("weekly")}
              className={`rounded-lg px-4 py-2 transition active:translate-y-px ${
                mode === "weekly" ? "bg-emerald-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              Weekly shirt order
            </button>
            <button
              type="button"
              aria-pressed={mode === "single"}
              onClick={() => setMode("single")}
              className={`rounded-lg px-4 py-2 transition active:translate-y-px ${
                mode === "single" ? "bg-emerald-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              Single PDF CSV
            </button>
          </div>

          {mode === "weekly" ? (
            <section className="rounded-xl border border-stone-300 bg-[#fbfcf8]/90 p-5 shadow-soft backdrop-blur sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={`grid gap-3 rounded-lg border p-4 transition hover:border-emerald-700 hover:bg-white ${uploadCardClass(hasPreviousFiles)}`}>
                  <input
                    ref={previousInputRef}
                    type="file"
                    aria-label="Previous or cumulative CampBrain PDFs"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      setPreviousFiles(fileListToArray(event.currentTarget.files));
                      setWeeklyResult(null);
                      setStatus("idle");
                      setMessage("Previous/cumulative files loaded. Add the current week next.");
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">Previous campers</span>
                    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${uploadStatusPill(hasPreviousFiles)}`}>
                      {hasPreviousFiles ? "Uploaded" : "Needed"}
                    </span>
                  </div>
                  <span className="text-lg font-semibold tracking-tight text-stone-950">
                    {hasPreviousFiles ? "Previous weeks loaded" : "Upload previous weeks"}
                  </span>
                  <span className="text-sm leading-6 text-stone-600">
                    {hasPreviousFiles
                      ? "These campers will be treated as already given shirts."
                      : "Add one cumulative PDF, or select multiple previous-week PDFs."}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      previousInputRef.current?.click();
                    }}
                    className="mt-2 w-fit rounded-md bg-emerald-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-950 active:translate-y-px"
                  >
                    {hasPreviousFiles ? "Replace previous PDFs" : "Choose previous PDFs"}
                  </button>
                  <span className={`rounded-md px-3 py-2 font-mono text-xs ${hasPreviousFiles ? "bg-white/85 text-emerald-950" : "bg-stone-100/70 text-stone-600"}`}>
                    {joinedFileNames(previousFiles)}
                  </span>
                </div>

                <div className={`grid gap-3 rounded-lg border p-4 transition hover:border-emerald-700 hover:bg-white ${uploadCardClass(hasCurrentFile)}`}>
                  <input
                    ref={currentInputRef}
                    type="file"
                    aria-label="Current week CampBrain PDF"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = fileListToArray(event.currentTarget.files)[0] ?? null;
                      setCurrentFile(file);
                      setWeeklyResult(null);
                      setStatus("idle");
                      setMessage(file ? "Current week file loaded. Run the comparison." : "Add the current week PDF.");
                    }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">Current week</span>
                    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${uploadStatusPill(hasCurrentFile)}`}>
                      {hasCurrentFile ? "Uploaded" : "Needed"}
                    </span>
                  </div>
                  <span className="text-lg font-semibold tracking-tight text-stone-950">
                    {hasCurrentFile ? "Current week loaded" : "Upload current week"}
                  </span>
                  <span className="text-sm leading-6 text-stone-600">
                    {hasCurrentFile
                      ? "This report will be checked against the previous campers."
                      : "This file should include the current week kids and their T-shirt sizes."}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      currentInputRef.current?.click();
                    }}
                    className="mt-2 w-fit rounded-md bg-emerald-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-950 active:translate-y-px"
                  >
                    {hasCurrentFile ? "Replace current PDF" : "Choose current PDF"}
                  </button>
                  <span className={`rounded-md px-3 py-2 font-mono text-xs ${hasCurrentFile ? "bg-white/85 text-emerald-950" : "bg-stone-100/70 text-stone-600"}`}>
                    {currentFile?.name ?? "No PDF selected"}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-stone-300 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className={`rounded-lg border px-4 py-3 text-sm ${statusTone}`} role="status" aria-live="polite">
                  <div className="font-medium">Status</div>
                  <div className="mt-1 opacity-80">{message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void processWeeklyFiles()}
                  disabled={!canCalculateWeekly}
                  className={`rounded-lg px-4 py-3 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed ${
                    canCalculateWeekly
                      ? "bg-emerald-900 text-white hover:bg-emerald-950"
                      : "bg-stone-200 text-stone-500"
                  }`}
                >
                  {hasPreviousFiles && hasCurrentFile ? "Calculate shirt order" : "Upload both PDFs first"}
                </button>
              </div>
            </section>
          ) : (
            <label
              onClick={() => singleInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setStatus("dragging");
              }}
              onDragLeave={() => setStatus("idle")}
              onDrop={onSingleDrop}
              className={`group grid min-h-[25rem] cursor-pointer place-items-center rounded-xl border border-dashed bg-[#fbfcf8]/90 p-6 text-center shadow-soft backdrop-blur transition duration-300 active:translate-y-px sm:p-10 ${
                status === "dragging"
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-stone-300 hover:border-emerald-700 hover:bg-white"
              }`}
            >
              <input
                ref={singleInputRef}
                type="file"
                aria-label="Single CampBrain PDF"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void processSingleFile(file);
                  event.currentTarget.value = "";
                }}
              />

              <div>
                <div className="mx-auto mb-7 grid size-16 place-items-center rounded-2xl border border-emerald-900/10 bg-emerald-900 text-white transition duration-300 group-hover:-translate-y-1">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-8"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  >
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M5 20h14" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Drop the report here</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-600">{singleHelperText}</p>

                <div className={`mx-auto mt-8 max-w-md rounded-lg border px-4 py-3 text-left text-sm ${statusTone}`} role="status" aria-live="polite">
                  <div className="font-medium">Status</div>
                  <div className="mt-1 opacity-80">{message}</div>
                  {lastFile ? <div className="mt-2 font-mono text-xs opacity-70">Last file: {lastFile}</div> : null}
                </div>
              </div>
            </label>
          )}

          {weeklyResult ? (
            <section className="rounded-xl border border-stone-300 bg-[#fbfcf8]/95 p-5 shadow-soft sm:p-6">
              <div className="flex flex-col gap-4 border-b border-stone-300 pb-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-950">Shirts needed for new campers</h2>
                  <p className="mt-1 text-sm text-stone-600">
                    Compared {weeklyResult.currentCount} current-week campers against {weeklyResult.previousCount} previous records.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const pdfBytes = await createShirtOrderPdf({
                        counts: weeklyResult.counts,
                        newCampers: weeklyResult.sortedNewCampers,
                        previousCount: weeklyResult.previousCount,
                        currentCount: weeklyResult.currentCount,
                        previousFiles: previousFiles.map((file) => file.name),
                        currentFile: currentFile?.name ?? "Current week PDF"
                      });
                      downloadBytes(pdfBytes, "New_Camper_Shirt_Order.pdf", "application/pdf");
                    }}
                    className="rounded-md bg-emerald-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-950 active:translate-y-px"
                  >
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCsv(newCampersToCsv(weeklyResult.sortedNewCampers), "New_Campers_Parsed.csv")}
                    className="rounded-md border border-stone-300 bg-[#fbfcf8] px-4 py-2.5 text-sm font-medium text-stone-950 transition hover:border-emerald-800 hover:bg-stone-50 active:translate-y-px"
                  >
                    Download CSV
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-lg border border-stone-300 bg-[#fbfcf8]">
                  <div className="border-b border-stone-300 bg-stone-100/80 px-4 py-3 text-sm font-semibold">
                    Counts by cabin and size
                  </div>
                  <div className="divide-y divide-stone-200">
                    {weeklyResult.counts.length > 0 ? (
                      weeklyResult.counts.map((count) => (
                        <div key={`${count.cabin}-${count.tshirtSize}`} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm">
                          <div>
                            <div className="font-medium text-stone-950">{count.cabin}</div>
                            <div className="font-mono text-xs text-stone-600">{count.tshirtSize}</div>
                          </div>
                          <div className="font-mono text-lg font-semibold text-emerald-950">{count.count}</div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-sm text-stone-600">No new campers found.</div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-stone-300 bg-[#fbfcf8]" tabIndex={0} aria-label="New camper shirt order table">
                  <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                    <thead className="bg-stone-100/80 text-stone-950">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Cabin</th>
                        <th className="px-4 py-3 font-semibold">Last Name</th>
                        <th className="px-4 py-3 font-semibold">First Name</th>
                        <th className="px-4 py-3 font-semibold">T-Shirt Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 bg-[#fbfcf8]">
                      {weeklyResult.sortedNewCampers.slice(0, 40).map((camper, index) => (
                        <tr key={`${camper.cabin}-${camper.lastName}-${camper.firstName}-${index}`}>
                          <td className="px-4 py-3 font-medium text-stone-950">{camper.cabin}</td>
                          <td className="px-4 py-3 text-stone-700">{camper.lastName}</td>
                          <td className="px-4 py-3 text-stone-700">{camper.firstName}</td>
                          <td className="px-4 py-3 text-stone-700">{camper.tshirtSize || "Missing size"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          {mode === "single" && parsed.length > 0 ? (
            <section className="rounded-xl border border-stone-300 bg-[#fbfcf8]/95 p-5 shadow-soft sm:p-6">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <h2 className="text-lg font-semibold text-stone-950">Last parse preview</h2>
                  <p className="mt-1 text-sm text-stone-600">Showing first 12 rows. Full CSV already downloaded.</p>
                </div>
                <div className="font-mono text-xs text-stone-600">
                  {Object.entries(byCabin)
                    .map(([cabin, count]) => `${cabin}: ${count}`)
                    .join(" / ")}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-lg border border-stone-300" tabIndex={0} aria-label="Single PDF parse preview table">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead className="bg-stone-100/80 text-stone-950">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Cabin</th>
                      <th className="px-4 py-3 font-semibold">Last Name</th>
                      <th className="px-4 py-3 font-semibold">First Name</th>
                      <th className="px-4 py-3 font-semibold">T-Shirt Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-[#fbfcf8]">
                    {parsed.slice(0, 12).map((camper, index) => (
                      <tr key={`${camper.cabin}-${camper.lastName}-${camper.firstName}-${index}`}>
                        <td className="px-4 py-3 font-medium text-stone-950">{camper.cabin}</td>
                        <td className="px-4 py-3 text-stone-700">{camper.lastName}</td>
                        <td className="px-4 py-3 text-stone-700">{camper.firstName}</td>
                        <td className="px-4 py-3 text-stone-700">{camper.tshirtSize || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 border-t border-stone-300 pt-5 text-sm text-stone-600 sm:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-sm font-semibold text-stone-950">CSV format</h2>
              <p className="mt-2 leading-6">
                Single PDF exports still use <span className="font-mono text-stone-900">[Original_PDF_Name]_Parsed.csv</span>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs text-stone-700">
                {["Cabin", "Last Name", "First Name", "T-Shirt Size"].map((column) => (
                  <span key={column} className="rounded-md border border-stone-300 bg-[#fbfcf8]/90 px-2 py-1">
                    {column}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-stone-950">Classroom matching</h2>
              <p className="mt-2 leading-6">
                Counselor names in parentheses are ignored, so classroom changes do not break parsing.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {parserConstants.cabins.map((cabin) => (
                  <span key={cabin} className="rounded-md border border-emerald-900/10 bg-emerald-50 px-2.5 py-1 font-mono text-xs text-emerald-950">
                    {cabin}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
