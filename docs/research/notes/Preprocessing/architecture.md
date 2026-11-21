# Document preprocessing for Dues: workflow and the experiment that tests it

Date: 2026-11-21. Inputs: `evidence.md` (same folder), ADR 0006, design.md §3 and §5, `Local VLM extraction/recommendation.md`, and the 42-bill GLM-5.3 Flash baseline in `private/experiment-data/llm-bharatcode-2026-11-20/`. Nothing in §2 has been run yet. Stages marked **on trial** are in the workflow only if they pass their keep rule in §2.

## 0. What the data already says (measured on the 42 bills, before any new run)

| Finding | Source | Consequence |
|---|---|---|
| GLM charges about one token per 28×28 px: an A4 page at 200 dpi capped to 1448×2048 is 3,782 image tokens + ~350 prompt = the 4,132 measured. No provider-side cap is visible up to 2,048 px | `usage.prompt_tokens` in the baseline files | Pixels are the token bill. Text PDFs average 8,117 prompt tokens, scans 3,838, photos 2,818 |
| All 18 text PDFs carry the printed total and the bill number verbatim in the text layer | pypdfium2 over the sample | A text-only path is plausible and makes "value present in the text layer" a validator for the whole class |
| `pdf_text-08` has 7 pages; the baseline sends 4 | page counts | The image path silently drops pages. The text of all 7 pages is ~2.5k tokens, less than one page image |
| The 14 "photos" are small: 8 are ≤ 1,600 px long side (messaging-app compressed), 3 are 2480×3508 scanner-app output, none is HEIC, none has an EXIF rotation, none is sideways | Pillow over the sample | The 2,048 cap touches 4 files. HEIC conversion and orientation detection have no bill to test on |
| About 4 of the 24 raster files show real background around the paper (`image-02`, `-03`, `-09`, `-10`); the rest are already tight | looked at them | Crop can help few bills. It has to earn its place |
| About 80% of completion tokens are reasoning (mean ~580 of ~720) | `completion_tokens_details` | Reasoning, not image size, is the likely latency lever |
| Three baseline "errors" are not reading errors: `image-11` (`2270-00` scored as 0: the harness takes the last number), `pdf_text-18` GSTIN (the gold value fails the GSTIN check digit; the model's reading, one letter different, passes), `image-10` GSTIN (gold has 14 characters) | rescoring by hand | Fix scoring and gold first (E0). No stage should be credited or blamed for these |
| Errors pixels could plausibly fix: `image-14` date (24/04 read as 24/09), `image-10` GSTIN (small print), `pdf_scan-07` total (blank in 1 of 2 runs). Errors pixels cannot fix: `image-04` (month-first date; the receipt also prints `03/06/2025` lower down), `pdf_text-09` and `image-07` (order printouts with no bill number), `pdf_text-17` (which reference) | per-bill review | At most ~3 bills are winnable by image work. Expect most image stages to fail their keep rule |
| GLM and DeepSeek agree on the total for 36 of 38 single-invoice bills and are right on all 36; on the 2 where they differ GLM is right | existing run files | Agreement between two model families is a usable confidence signal at no preprocessing cost |

## 1. Workflow

### 1.1 Shape

```
paperless original bytes + checksum
        │
        ▼
  Preprocess.prepare(bytes, mime)            pure, CPU only, no network
        │  Prepared{class, pages[], textLayer?, pagesTotal, pagesSent, recipe}
        ▼
  Extractor.extract({images, textLayer, schema})   one request per file
        │  RawExtraction (values as printed)
        ▼
  Reading stored  →  fold: convert, validators, confidence   (Intake, design §3)
        │
        └─ only if a trigger fires: one more Reading from the next provider row
           (other model family) on the other view; Claimant confirms either way
```

### 1.2 Stages

| # | Stage | Rule | Status |
|---|---|---|---|
| 1 | Detect class | By content, not by model: PDF with ≥ 50 non-space characters of text layer → `pdf_text`; other PDF → `pdf_scan`; JPEG/PNG/WebP → `image`; anything else → not readable, Intake takes the "couldn't read" path. Use the paperless **original**, never the archive version (its text layer is tesseract output) | fixed |
| 2 | Normalise | Images: apply EXIF orientation, RGB, JPEG q90. No HEIC step and no rotation detection: 0 of 42 files need either | fixed |
| 3 | Page selection | `pdf_text`: all pages of text (cap 20 pages / 20,000 characters). Image pages: first 4. Always return `pagesTotal` and `pagesSent`; when they differ the fold caps confidence so a human looks | fixed |
| 4 | Multi-invoice split | None. The model already returns one entry per invoice (2–3 found in all 4 multi-invoice files by every model); contract 2 carries `invoices[]` | fixed (no stage) |
| 5 | Text path vs image path | `pdf_text` → text layer only, no image. `pdf_scan`, `image` → image only | **on trial** (V1; fallback V2: text + 100 dpi image; else baseline: text + 200 dpi image) |
| 6 | Crop / deskew | Rasters only: find the paper, warp it flat; fall back to the untouched image | **on trial** (V2) |
| 7 | Resolution | One policy for all providers: long side ≤ 2,048 px, never upscale. Candidates: cap 1,280 (V1), upscale small crops to 2,048 (V3) | baseline fixed; changes **on trial** |
| 8 | Region crops | Full page + enlarged header and footer bands in the same request | **on trial** (V4) |
| 9 | Contrast | None | fixed (no stage) |
| 10 | Request | One request per file, `temperature 0`, `json_schema`. Reasoning off | reasoning off **on trial** (V5) |
| 11 | Validators | In Intake's fold, unchanged from design §3, plus two the data asks for: day/month ambiguity (both orders valid and another date on the page disagrees) and `total` found verbatim in the text layer | fixed |
| 12 | Second Reading | Only when a trigger fires (§1.4) | triggers **on trial** (E0, offline) |

Not built, with the reason: HEIC (no file; paperless intake decides what arrives, check its accepted types once), 90° rotation detection (no file), CLAHE/binarisation (no published gain for VLMs, published harm to faint strokes, and none of the residual errors is a contrast failure), QR decode (6 of 42 have a QR, none is a GST e-invoice QR, 1 of 6 decodes), a per-provider resolution table (one provider family in use; add a `maxSide` field on the provider config row when a second one needs a different value), a page-chunking loop for long scans (longest scan is 2 pages). Add each when a real bill needs it.

### 1.3 Routing per document class

| Class (n) | Sent today | Sent in the designed workflow | What decides |
|---|---|---|---|
| `pdf_text` (18): e-commerce and GST invoices, one PDF payment proof | ≤ 4 pages at 200 dpi + text layer, ~8.1k tokens | all pages of text, ~1–3k tokens | V1, V2 |
| `pdf_scan` (10): 5 handwritten, 5 printed | ≤ 4 pages at 200 dpi, ~3.8k tokens | same pages; cropped and resized only if V1–V4 say so | V1–V4 |
| `image` (14): photos, scanner-app JPEGs, 3 UPI screenshots | ≤ 2,048 px, ~2.8k tokens | same; cropped only if the detector finds the paper (screenshots fall through untouched) | V1–V4 |

Document type (Invoice, Informal bill, Payment proof) is not a routing input. It is an output of the Reading (`kind`), and the fold uses it afterwards: a handwritten Informal bill never auto-accepts.

### 1.4 Second Reading: when, and from whom

Triggers, evaluated by the fold on the first Reading:

1. `grand_total` is null, or a required key field for the `kind` is null.
2. A validator fails: GSTIN check digit, total absent from the text layer (`pdf_text`), date implausible or day/month ambiguous, UPI reference not 12 digits.
3. `kind` is `handwritten_bill`.
4. `pagesSent < pagesTotal`.

Action: one more Reading from the next provider row of a different model family (today DeepSeek on the same BharatCode base URL, ~21 s), on the other view where one exists (`pdf_text`: page image at 200 dpi instead of text). Agreement raises confidence; disagreement shows both values to the Claimant. No third call, no voting loop. A second run of the same model on the same view is not used: GLM's two runs agree on 94% of fields whether right or wrong.

### 1.5 Where it plugs in

**Preprocess is its own Module, called by Intake before the Extractor Seam. It is not inside the `openai-compatible` Adapter.**

- Interface: `prepare(bytes, mime) → Prepared{class, pages: jpeg[], textLayer?, pagesTotal, pagesSent, recipe} | unreadable`. Pure function of the bytes: no network, no Claimant data, no provider knowledge.
- The Extractor port in design §3 already takes `{images[], textLayer?, schema}`, so the Interface on that Seam does not change. The line "Hides: page rendering, text layer" in §3 moves from the Adapter to Preprocess (a design.md edit for the owner; not made here).
- Depth: one call hides class detection, rendering, page selection, crop and its fallbacks, resizing and encoding.
- Leverage: every provider row gets the same pages; the second Reading reuses the first one's `Prepared`; the push path (a Claimant's Claude Code) can be served the same normalised pages through `read_document`.
- Locality: every "what pixels do we send" decision lives in one place and carries one `recipe` string. Changing the recipe is one edit and one gold-set run.
- Not a Seam yet: there is one implementation and it is deterministic, so tests feed it fixture files and assert on `Prepared`. The Extractor Seam keeps its two Adapters (`openai-compatible`, `canned`); the canned Adapter never has to render anything.
- `recipe` goes into the Reading's `extractor.version`, so Readings from different views are distinct rows and a recipe change does not collide with old Readings.

### 1.6 What is cached

- **Readings, by checksum.** Already in the design: unique on (document, extractor name, model, version). With `recipe` in the version this is the only cache needed: the same bytes are never sent to the same provider with the same recipe twice, including on webhook redelivery and on re-upload of an identical file.
- **`Prepared` is not cached.** It is deterministic and costs well under a second per page; it is rebuilt when a second Reading is needed. Add a disk cache keyed by (checksum, recipe) only if that rebuild shows up in job timings.

### 1.7 TypeScript or Python

Decided by V2–V4, because OpenCV is the only thing Python offers here.

- **If no crop stage passes (the expected outcome): in the TypeScript app, in-process.** What remains is text-layer read, page render, EXIF transpose, resize, JPEG encode: `sharp` plus a pdfium/pdf.js binding. No second container on a 4 GB host, no extra network hop or failure mode, one deploy, one version string.
- **If a crop stage passes: a small Python worker** (the `pe-py` stack: pypdfium2, Pillow, OpenCV; one endpoint that mirrors `prepare`) as the second implementation behind the same Interface, at which point Preprocess becomes a real Seam with two Adapters. Do the whole of `prepare` there rather than splitting stages across two languages. Cap it at one worker process; a 200 dpi A4 page is ~15 MB decoded.
- Either way the recipe is ported from the harness with the gold set as its contract test: same files in, same `Prepared` dimensions out.

## 2. Experiment

Model `glm-5.3-flash` on the same BharatCode endpoint, same prompt and schema, `temperature 0`, `seed 7`, 2 runs per variant, 2 bills at a time (`--workers 2`). The existing `bc-glm-5.3-flash-r1/r2` files are the baseline and are not re-run.

### 2.1 E0: offline, no requests, do first

1. Fix `to_amount` so `2270-00`, `700/-`, `250/-`, `10,000.00 INR`, `Rs 1,341.90`, `₹1117.20` convert correctly. Correct gold `pdf_text-18` GSTIN (check-digit proof above). Leave `image-10` GSTIN for a human to read off the receipt; report it, do not edit it.
2. Re-score the baseline. This is the reference for every rule below.
3. Trigger report from existing files only: for the trigger set in §1.4 (those computable in the harness: null key field, GSTIN check digit, total absent from text layer, `kind == handwritten_bill`), list which bills fire and which bills have a wrong key field. And the agreement report: GLM r2 against DeepSeek r1, per field, counting agree-right, agree-wrong, disagree.

### 2.2 Variants

Common to every variant unless stated: EXIF transpose, RGB, JPEG q90, ≤ 4 page images, one request per bill, no contrast step, no upscaling.

| Tag | `pdf_text` recipe | `pdf_scan` / `image` recipe | Bills | Tests |
|---|---|---|---|---|
| `bc-` (V0, exists) | pages at 200 dpi, long side ≤ 2,048, + text layer (first 4 pages, 12,000 chars) | 200 dpi / long side ≤ 2,048, no crop | 42 | reference |
| `v1lean-` | **text layer only**, no image, all pages up to 20, 20,000 chars | long side ≤ **1,280** (PDF render scale = min(200/72, 1280 / long side in points)), no crop | 42 | text path; lower cap |
| `v2crop-` | pages at **100 dpi** + text layer as in V1 | **document crop** (below), then long side ≤ 2,048, no upscale | 42 | cheap image beside text; crop |
| `v3zoom-` | not run | V2 crop, then **resize so long side = 2,048** (Lanczos; upscale factor capped at 2.5; scanned PDFs are re-rendered at scale 2048 / long side in points, capped at 500 dpi, instead of upscaling) | 24 | more pixels per character |
| `v4bands-` | not run | V2 crop output as image 1, plus **two region crops** of the first page (below) as images 2 and 3, same request | 24 | region crops |
| `v5nothink-` | as V0 | as V0 | 42 | reasoning off (request body only) |

Ladder: V2 is compared with V0, V3 and V4 with V2. If V2's crop fails its rule, still read V3 and V4 against V2 (same crop input), and re-run the winner without crop only if it passes.

**Document crop (V2, reused by V3 and V4).** Input: the page as an RGB array. Work on a copy scaled to 1,000 px long side, map the result back to full resolution.

1. Quad: grey → Gaussian blur 5×5 → try two masks in order: Otsu threshold; Canny(50, 150) dilated with a 3×3 kernel, 2 iterations. For each, take the largest external contour, `approxPolyDP` at 2% of its perimeter. Accept if it has 4 points, is convex, covers 25–92% of the frame, and every corner angle is 60–120°. On accept: four-point perspective warp to the quad's own width and height (this is also the deskew).
2. Fallback 1, bounding box: mask of pixels differing by more than 25 (max over channels) from the median colour of a 2% border strip; bounding box of the mask, padded 2%. Accept if it covers 10–90% of the frame. Crop, no warp.
3. Fallback 2: the untouched image.

Record which path was taken per page (`quad`, `bbox`, `none`) and the output size. No rotation step.

**Region crops (V4).** From the cropped first page (for a multi-page scan: header from the first page, footer from the last): header = rows 0–40% of the height, footer = rows 55–100%, full width. Resize each to width 1,536 (Lanczos, up or down), then cap the long side at 2,048. Add one text part before the images: "Image 1 is the whole page. Images 2 and 3 are enlarged copies of its top and bottom parts."

**Reasoning off (V5).** Probe with one bill before the run: add `"thinking": {"type": "disabled"}` to the body. Pass = HTTP 200 and `usage.completion_tokens_details.reasoning_tokens == 0`. If it fails, try `"reasoning_effort": "none"` the same way. If neither zeroes the reasoning tokens, do not run V5 and record that the provider offers no switch.

Size: 84 + 84 + 48 + 48 + 84 = 348 requests, about 1.5–2 hours at the measured 33–57 s mean with 2 in flight.

### 2.3 Scoring

Same scorer: total, date, bill no, GSTIN, vendor; all-key (total + date + bill no); by kind; consistency between the two runs; wrong totals; mean and max seconds. Added: mean prompt tokens and mean completion tokens per run and per class, crop path counts, and a per-variant diff against its reference.

Per bill and field, over a group's two runs: **right** = right in both, **wrong** = wrong in both, **flaky** = the runs differ. Then against the reference group (V0, or V2 for V3 and V4):

- **fixed**: reference wrong → variant right.
- **broken**: reference right → variant wrong or flaky.
- Anything flaky in the reference counts as neither. Fields with no gold value are skipped as today.

Fixes and breaks are counted in bills (a bill with any fixed field and no broken field is one fix; any broken field makes it one break), over all five fields, within the classes the stage touches.

### 2.4 Keep rules

| Stage | Variant vs reference, class | Keep only if |
|---|---|---|
| Text-only path | V1 vs V0, `pdf_text` | 0 broken bills, 0 wrong totals, invoice count on each of the 4 multi-invoice files ≥ V0's, and mean prompt tokens down ≥ 30% (expected ~75%) |
| Text + 100 dpi image | V2 vs V0, `pdf_text` | Considered only if text-only fails. 0 broken, prompt tokens down ≥ 30% |
| 1,280 px cap | V1 vs V0, `pdf_scan` + `image` | 0 broken, 0 wrong totals, prompt tokens down ≥ 30% |
| Document crop | V2 vs V0, `pdf_scan` + `image` | 0 broken, and either ≥ 2 bills fixed or prompt tokens down ≥ 30%. Also report how many of 24 took the `quad` or `bbox` path; under 6 means the stage is idle on this corpus and is dropped even if harmless |
| Upscale to 2,048 | V3 vs V2, `pdf_scan` + `image` | ≥ 2 bills fixed and 0 broken (it costs tokens, so only accuracy can justify it) |
| Region crops | V4 vs V2, `pdf_scan` + `image` | ≥ 2 bills fixed and 0 broken. If V3 and V4 both pass, keep the one with more fixes; on a tie keep V3 (one image, simpler) |
| Reasoning off | V5 vs V0, all 42 | 0 broken on total, at most 1 broken bill overall with ≥ 1 fixed to offset it, and completion tokens down ≥ 30% |
| Second-Reading triggers | E0 | Triggers fire on every bill with a wrong total and on ≥ 80% of bills with any wrong key field, while firing on ≤ 40% of all bills |
| Cross-family agreement as confidence | E0 | Agree-and-wrong totals = 0, agree-and-wrong dates + bill numbers ≤ 1 (excluding bills with no gold value) |

Notes on reading the result:

- Latency is judged on tokens, not seconds. The endpoint is shared: the baseline's own two runs average 57 s and 33 s on identical input. Seconds are reported, not gated.
- One bill is 4–10 points in any class. The rules are counts for that reason, and "0 broken" is deliberately strict: a stage that trades one bill for another is not worth its code.
- Stages that pass independently are combined into one final recipe and that recipe gets one confirming run (2 runs, 42 bills) before it is ported. A combination is not assumed to be the sum of its parts.

## 3. Implementation brief (builder)

One file changes: `private/experiment-data/llm-bharatcode-2026-11-20/llm_bench.py` (a copy runs on the experiment host in the `pe-py` image). No new dependencies: pypdfium2, Pillow, OpenCV (`cv2`), numpy, dateparser are in the image. Do not touch `llm-status.sh`, `sample.json`, the prompt or the schema. Existing output files must still score unchanged apart from the `to_amount` fix.

**Add**

1. `RECIPES`: a dict keyed by variant name (`base`, `v1lean`, `v2crop`, `v3zoom`, `v4bands`, `v5nothink`), each `{pdf_text: {...}, raster: {...}, body: {...}}` with the fields `image` (bool), `dpi`, `max_side`, `fit_side` (resize to exactly this long side, or None), `text` (bool), `text_pages`, `text_chars`, `crop` (bool), `bands` (bool), and `body` (extra request fields). `raster: None` or `pdf_text: None` means that class is not run. `base` must reproduce today's behaviour exactly.
2. `crop_doc(im) -> (im, path)` per §2.2, `path` in `quad | bbox | none`.
3. `bands(im) -> [header, footer]` per §2.2.
4. CLI: `--variant NAME` (default `base`), `--report FILE` (default `report-llm.md`), `--selftest`.

**Change**

- `pages(item, recipe)` → `(imgs, text, prep)`. Class = `item["kind"]` (`pdf_text`, `pdf_scan`, `image`); `pdf_scan` and `image` use `recipe["raster"]`. Return `None` when the class is not run. `prep = {"class", "pages_total", "pages_sent", "crop": [path per page], "sizes": [[w, h], ...], "text_chars"}`.
- `call(..., extra=None, note=None)`: merge `extra` into the body; when `note` is set add it as a text part before the images. With no images, send text only. Everything else unchanged.
- `one(base, key, model, item, recipe)`: pass the recipe through; add `"variant"` and `"prep"` to the record.
- `run()`: skip items whose class is not run for the variant (they are simply absent from the output file and the log). Output path and log line stay in the existing format: `out/llm/<tag><model>-r<k>.json` and `<tag><model> r<k> <id> <secs>s ok`.
- `to_amount`: strip a trailing `/-`, and treat a trailing `-NN` or `.NN` (two digits) as paise, before taking the number.
- `score()`: denominators use the ids present in each run, not all ids; add columns `prompt tok` and `compl tok` (means) to the main table and a per-class token table; add sections "Crop paths" (counts per run), "Diff against reference" (per variant group: fixed, broken, flaky bill ids with field names, token change per class, and the §2.4 verdict line for each stage that variant tests), "Triggers" and "Agreement" (E0, computed from `bc-glm-5.3-flash-r2` and `bc-deepseek-v4.1-flash-r1`). Reference group: `bc-<model>`, except `v3zoom` and `v4bands` whose reference is `v2crop-<model>`. A group is the run name with `-r<k>` removed, as today.
- `--selftest`: asserts for `to_amount` on the six strings in §2.1; `crop_doc` on a synthetic image (a light rectangle rotated 8° on a dark ground) returns `quad` with output area within 10% of the rectangle's; on a plain white image returns `none`; `base` recipe output for one PDF and one photo has the same pixel sizes as before the change.

**Tags and run order** (model is always `--model glm-5.3-flash`, `--runs 2 --workers 2`, `--report report-preproc.md`):

| Order | Command tail | Run names in `llm.log` and `out/llm/` | Rows in the status script |
|---|---|---|---|
| 0 | `--score-only --report report-preproc.md` after the scoring fixes (E0) | none | none |
| 1 | `--variant v1lean --tag v1lean-` | `v1lean-glm-5.3-flash-r1/r2` | 42/42 |
| 2 | `--variant v2crop --tag v2crop-` | `v2crop-glm-5.3-flash-r1/r2` | 42/42 |
| 3 | `--variant v3zoom --tag v3zoom-` | `v3zoom-glm-5.3-flash-r1/r2` | 24/42 (expected: rasters only) |
| 4 | `--variant v4bands --tag v4bands-` | `v4bands-glm-5.3-flash-r1/r2` | 24/42 (expected) |
| 5 | probe, then `--variant v5nothink --tag v5nothink-` | `v5nothink-glm-5.3-flash-r1/r2` | 42/42 |

The status script groups on the first two columns of `llm.log`, so the tags above appear as new rows without changes. The scorer globs `out/llm/*.json`, so they are picked up the same way. Append to `llm.log`, never truncate it.

**Done when**: `--selftest` passes; `report-preproc.md` holds the baseline re-score, the E0 trigger and agreement sections, all five variants (or V5 recorded as not available), and one verdict line per row of §2.4.

## 4. Open points for the owner

1. design.md §3 says the Adapter hides page rendering while the port takes `images[]`. This note resolves it as a separate Preprocess Module; §3 needs the one-line edit and `recipe` added to `extractor.version`.
2. ADR 0006 describes the provider list as tried in order on failure. §1.4 also consults the next row when a trigger fires. That is a small extension of the ADR, to accept or reject once E0 reports.
3. The "which invoice in a multi-invoice file is the Bill" question (`pdf_text-10`: the first entry is a ₹0.35 marketplace fee invoice) is a fold and Matching matter, not preprocessing. It is untouched here.
4. Confirm once which file types paperless accepts on this install; anything it rejects never reaches Preprocess.
