# Claim form to PDF: spike 1.2 results (2026-11-21)

Question: can the Claim form be filled from data and turned into a PDF that keeps the form's general format and structure with no information loss? Pixel match with Word is not required (owner, 21 Nov 2026).

## Method in brief
- Input: the claim form (a .docx with a 7-column table), filled from two fictional Claims: a = 6 rows (Word: 1 page), b = 18 rows with long descriptions (Word: 2 pages, one page break).
- Reference: Microsoft Word (Mac) save-as-PDF of the same fill. All conversions ran on a 4 GB x86_64 LXC in throwaway containers.
- Fill tools compared on the .docx: python-docx, docxtpl, docxtemplater 3.71.1, Carbone 3.9.2. Word renders all four fills pixel-identically (0.00% diff), so the fill tool is chosen on ergonomics, not output.
- Diff% = share of pixels differing by more than 48/255 (100 dpi, grayscale) and SSIM, page 1 of a, pages 1 and 2 of b. Reference only.
- No-information-loss check: `pdftotext -raw`, whitespace-normalised, and every row's date, bill no, description, amount, receipt and remark, plus total, amount in words, name and submission date, compared field by field with the data JSON (40 fields for a, 112 for b).
- Peak RAM from the container cgroup. Fonts: Liberation (metric-compatible with Arial and Times New Roman, SIL OFL) or each image's own. Microsoft fonts were used only in a reference run in a throwaway container and are not deployable.

## Results
| Tool (version) | Fonts | Pages a/b (Word 1/2) | Fields missing a / b | Diff% / SSIM a p1, b p1, b p2 | Time cold / warm | Peak RAM | Image | Licence |
|---|---|---|---|---|---|---|---|---|
| Gotenberg 9-libreoffice (9.9.1) | default (Liberation) | 1/2 | 0 / 0 | 2.7/0.948, 3.9/0.919, 1.5/0.971 | 0.60 s / 0.1 s | 104 MiB | 381 MB | MIT (LibreOffice MPL-2.0) |
| Gotenberg 9-libreoffice | real Arial (reference only, not deployable) | 1/2 | ok | 2.2/0.958, 3.5/0.929, 1.5/0.971 | 0.60 s / 0.1 s | 104 MiB | 381 MB | as above |
| Carbone EE image, community mode | bundled | 1/2 | ok | 1.8/0.968, 3.0/0.938, 1.0/0.983 | 0.5 s / 0.27 s | 700 MiB | 3.06 GB | free community mode, font and licence provenance unclear |
| ONLYOFFICE Document Server | bundled | 1/2 | ok | 2.8/0.944, 5.1/0.884, 1.8/0.969 | 1.0 s | 668 MiB | 1.84 GB | AGPL-3.0 |
| Aspose.Words for Python 26.11.0 (evaluation) | Liberation | 1/2 | ok | 9.8/0.692, 12.2/0.621, 5.8/0.776 | 1.3 s / 0.2 s | ~125 MiB | 31 MB base | commercial; evaluation watermark inflates the diff |
| Aspose.Words | system fonts only | 1/2 | fails (2 and 14 items missing or wrapped) | 11.7/0.621, 13.5/0.575, 8.5/0.678 | 1.5 s | ~128 MiB | 31 MB base | commercial |
| docx4j 11.4 + FOP | none embedded | 1/2 (page break at row 15, Word row 12) | ok | 8.6/0.707, 13.2/0.548, 4.6/0.818 | ~2.2 s incl. JVM | 461-492 MiB | 380 MB | Apache-2.0 |
| HTML control, Gotenberg 9-chromium | Liberation | 1/2 (break at row 14) | ok | 9.1/0.694, 13.3/0.537, 5.7/0.808 | 0.58 s / 0.19 s | 237-376 MiB | 819 MB | BSD (Chromium) |
| **Typst 0.15.1** (official image, pinned) | Liberation (Debian `fonts-liberation` 1.07.4) | 1/2 (break at row 14) | **0 / 0** | 9.6/0.684, 13.7/0.540, 6.2/0.776 | 0.42 s / ~0.06 s | 7-9 MiB | 29.8 MB | Apache-2.0 (fonts SIL OFL) |

"ok" means the earlier amount, total and words check passed; the full field-by-field check was run for Gotenberg (default fonts), Typst and the Word reference, all 0 missing.

## Structure versus Word
- Gotenberg (LibreOffice) reproduces Word's page count, row heights, wrapping and the page-break row. Remaining diff is glyph outlines and tiny kerning shifts, not layout.
- Typst has the same sections in the same order (title block, date line, name and submission date, code and designation, 7-column table, total, amount in words, three signature blocks), with the header row repeated on page 2. It breaks page 1 earlier (row 14 against Word's 12), has tighter padding and smaller header text. It was a hand rebuild from the reference image, not generated from the .docx.
- The Word reference and Gotenberg do not repeat the header row on page 2 (the template's header row is not marked as a repeating header). Typst does. Neither loses information.

## Findings
- Typst passes the no-information-loss check, and is the lightest option (30 MB image, 9 MiB). It is not chosen: it needs a second template kept in step with the .docx, so the two can drift.
- Gotenberg with its default fonts passes the same check and is the closest to Word, with no font install. A fonts-liberation-sans-narrow layer changed nothing (identical output).
- Not run: Collabora and unoserver (same LibreOffice engine as Gotenberg), and tools that need a licence key (Apryse, Nutrient, Syncfusion).
