# CampBrain PDF to CSV Converter

A lightweight single-page Next.js utility for converting CampBrain PDF roster reports into a CSV with these exact columns:

```csv
Cabin,Last Name,First Name,T-Shirt Size
```

## Features

- Browser-side PDF processing with `pdfjs-dist`
- No database, login, API route, or server upload
- Tailwind CSS drag-and-drop UI
- Automatic CSV download named `[Original_PDF_Name]_Parsed.csv`
- CampBrain-specific cabin, camper name, and T-shirt size parsing

## Recognized cabins

- Mini Camp
- B&B - 1 (Dianne)
- B&B-2 (Marlie)
- B&B-3 (Valeria)
- Vipers-1 (Britt)
- Vipers 2 (Anthony)
- Pythons
- Constrictors
- Junior High

## Valid T-shirt sizes

- Youth XS
- Youth S
- Youth M
- Youth L
- Adult S
- Adult M
- Adult L
- Adult XL

## Local development

Requires Node 20.18+ because this project targets current Next.js/Vercel defaults.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel deployment

This app is Vercel-ready. Import the repo into Vercel and deploy with default Next.js settings.

The `postinstall` script copies the pdf.js worker from `node_modules/pdfjs-dist` into `public/pdf.worker.min.mjs`, avoiding fragile worker imports during production builds.

## Parser notes

The parser groups pdf.js text items into visual rows using text coordinates. It then tracks the active cabin as rows are scanned top-to-bottom and emits camper rows when it finds `LastName, FirstName` patterns. T-shirt size detection checks nearby row text first, then falls back to full-row matching.
