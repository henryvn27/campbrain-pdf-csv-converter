# CampBrain PDF to CSV Converter

I built this because I needed a better way to pull shirts for new campers each week.

As a summer camp counselor, I was working from CampBrain roster PDFs, but CampBrain did not have a simple way to answer the question I actually needed every week: which kids are new, what cabin are they in, and what shirt sizes do I still need to hand out?

This project turns that weekly chore into a browser-only workflow. It supports two main jobs:

1. Convert a single CampBrain roster PDF into a CSV with these exact columns:

```csv
Cabin,Last Name,First Name,T-Shirt Size
```

2. Compare previous-week camper PDFs against the current week, find only the new campers, and generate:
- a printable shirt-order PDF checklist
- a CSV of those new campers in the same row format

No PDFs are uploaded to a server. Parsing happens in the browser with `pdfjs-dist`.

## What it is for

Use this app when you need to:

- turn a CampBrain roster PDF into a clean CSV
- figure out which campers are new this week
- count shirts only for campers who have not already received one
- print a cabin-grouped checklist for shirt handout

In practice, the main use case is weekly shirt distribution: compare the current week's campers against previous weeks, isolate only the new kids, and produce a list that is actually useful on the ground.

## Core behavior

- Browser-side PDF processing with `pdfjs-dist`
- No database, login, API route, analytics, or server upload
- Automatic CSV download named `[Original_PDF_Name]_Parsed.csv`
- Weekly comparison flow for shirt-order PDFs and CSV exports
- Counselor names in cabin labels are ignored during parsing

## Recognized cabin labels

The parser currently recognizes these cabin groups:

- Mini Camp
- B&B - 1
- B&B-2
- B&B-3
- Vipers-1
- Vipers 2
- Pythons
- Constrictors
- Junior High

Cabin matching is intentionally loose around spaces, hyphens, and counselor names in parentheses.

## Valid T-shirt sizes

- Youth XS
- Youth S
- Youth M
- Youth L
- Adult S
- Adult M
- Adult L
- Adult XL

If a PDF uses different wording for sizes, those rows may come through with a missing size and should be reviewed before ordering shirts.

## Privacy and data handling

- PDFs stay on the user's device during parsing
- This repo does not include sample camper data
- This repo should not contain counselor names, camper names, emails, phone numbers, or other personal data in documentation or committed fixtures

## Local development

Requires Node 20.18+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deployment

This app is Vercel-ready and uses default Next.js deployment settings.

The `postinstall` script copies the pdf.js worker from `node_modules/pdfjs-dist` into `public/pdf.worker.min.mjs`, which keeps the worker path stable in production.

## Parser notes

The parser:

- groups pdf.js text items into visual rows using text coordinates
- tracks the active cabin as rows are scanned top-to-bottom
- extracts camper rows when it finds `LastName, FirstName`
- looks for valid T-shirt sizes near the name first, then falls back to full-row matching

If CampBrain changes the report formatting, the first things to check are:

- whether cabin headers still match expected labels
- whether names still appear as `LastName, FirstName`
- whether T-shirt sizes still use the expected wording
