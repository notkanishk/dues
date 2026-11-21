# Preprocessing for VLM field extraction: evidence notes

Research date: 2026-11-21. Read-only web research. Every fact has a URL. Facts from search snippets (not a full fetch of the page) are marked "(snippet)". Anything not on a primary source is marked UNCONFIRMED.

Primary-source fetch gaps: GLM-5.x docs were not fetched (only GLM-4.5V and GLM-4.6V pages). The OpenCV WeChatQRCode page returned HTTP 403. The Qwen docs page returned 404. The pillow-heif plugin page and the Tesseract tessdoc pages were not read. The Gemma 4 model card and Qwen processor configs were only seen in search snippets.

---

## Q1. Image resolution and token budgets

| Fact | Source |
|---|---|
| Claude: each 28x28 px patch is one visual token; image cost = ceil(w/28) x ceil(h/28). Max 8000x8000 px per image; if a request has more than 20 images a stricter per-image limit applies. | https://platform.claude.com/docs/en/build-with-claude/vision |
| Claude standard tier: 1920x1080 is downsized to 1456x819 (1,560 tokens); 1000x1000 is not resized (1,296 tokens); 200x200 is not resized (64 tokens). High-res tier on higher models: 3840x2160 goes to 2576x1449 (4,784 tokens). The vision doc says high-res uses up to ~3x more tokens. | https://platform.claude.com/docs/en/build-with-claude/vision |
| Claude: images are downscaled when they exceed the model's long-edge limit or visual-token limit. Doc advises pre-resizing, and warns of hallucination/errors on "very small images under 200 pixels" and on text that is "too small". It says "Avoid cropping out key visual context solely to enlarge the text." | https://platform.claude.com/docs/en/build-with-claude/vision |
| Claude PDF: each page image is at most 1,568 visual tokens on every model; text costs an extra ~1,500-3,000 tokens/page. Max 100 pages per request when context window is under 1M tokens (600 otherwise). | https://platform.claude.com/docs/en/build-with-claude/pdf-support |
| Claude accepted image formats: JPEG, PNG, GIF, WebP only. HEIC is not in the list. | https://platform.claude.com/docs/en/build-with-claude/vision |
| OpenAI (page now at developers.openai.com): `detail` defaults to `auto`. `low` = base tokens only (85 for gpt-4o/gpt-4.1, regardless of size). `high`/`auto` use tiles: 170 tokens per 512 px tile on gpt-4o/4.1. Scale to fit 2048x2048; if shortest side > 768, scale shortest side to 768. "Smaller images are not enlarged." | https://developers.openai.com/api/docs/guides/images-vision |
| OpenAI patch-based models: patch count = ceil(w/32) x ceil(h/32), times a model multiplier, rounded up. | https://developers.openai.com/api/docs/guides/images-vision |
| Gemma 4: user picks a visual token budget of 70, 140, 280, 560 or 1120. Budget is a hard cap. Patches generated = 9 x budget, pooled 3x3 into one token. Higher budget preserves more detail; lower is faster. | https://ai.google.dev/gemma/docs/capabilities/vision (redirects to https://gemma.ai/get-started/capabilities/vision/) |
| Gemma 4: aspect ratio handling and patch pixel size are not stated on the capabilities page. Model card (snippet) says "variable aspect ratios" are supported via a configurable visual token budget. | https://ai.google.dev/gemma/docs/core/model_card_4 (snippet) |
| Qwen2.5-VL: native dynamic resolution; ViT patch stride 14; 2x2 patch groups; input resized to multiples of 28 px before the ViT. The paper does not state default min/max pixels. | https://arxiv.org/html/2502.13923v1 |
| Qwen2.5-VL checkpoint defaults differ. A 7B processor config (snippet) lists max_pixels 12845056 (= 16,384 tokens of 28x28). Model-card example (snippet) uses 256 to 1280 tokens. Some fine-tunes ship a 64-token cap. Pass min/max pixels explicitly. | https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/blob/main/README.md (snippet, secondary) |
| GLM-4.5V / 4.6V API docs: image sent as `image_url`. No resolution or detail parameter documented. No image size limit or token cost documented. `thinking` field shown only as `{"type":"enabled"}`. | https://docs.z.ai/guides/vlm/glm-4.5v ; https://docs.z.ai/guides/vlm/glm-4.6v |
| GLM-4.1V-Thinking paper: model perceives images "at their native resolutions and aspect ratios". This is a model claim, not an API parameter. | https://arxiv.org/html/2507.01006v2 (snippet) |

**Small vs large images, summary:** Claude and OpenAI both downscale large images to a fixed cap and do not enlarge small ones. Claude says images under 200 px are error-prone. Gemma 4 and Qwen2.5-VL let you choose the cap explicitly.

**Sweet spot for small-text accuracy:** No primary-source published sweet spot found. Gemma 4 advises a higher budget for fine detail (1120 is the top option). Qwen's 256-1280 range is a model-card example, not a tuned optimum. UNCONFIRMED.

---

## Q2. Crop, perspective correction, deskew, orientation

| Fact | Source |
|---|---|
| Claude PDF best practice list includes "Rotate pages to proper upright orientation". | https://platform.claude.com/docs/en/build-with-claude/pdf-support |
| Skew/in-plane rotation lowered structured extraction accuracy for every multimodal LLM tested (snippet; full paper not read). | https://arxiv.org/abs/2406.10295 (snippet) |
| Brazilian LLM-extraction paper: skew correction had the highest average score for one proprietary model; effects vary by model and document type (snippet). | https://sol.sbc.org.br/index.php/eniac/article/download/46889/46646/ (snippet) |
| UVDoc: small fully convolutional network predicting a 3D mesh and 2D unwarp grid; claims SOTA on DocUNet. No numeric values read. | https://arxiv.org/abs/2302.02887 |
| DvD (2025, diffusion dewarping): says current MLLMs often fail to keep document structure intact when dewarping (snippet). | https://arxiv.org/html/2505.21975v2 (snippet) |
| docTR has a `page_orientation_predictor` (default architecture `mobilenet_v3_small_page_orientation`) and a switch to disable page orientation inside `ocr_predictor`, plus `disable_crop_orientation=True`. | https://github.com/mindee/doctr/releases (snippet of release notes) |
| Tesseract OSD: PSM 0 runs orientation and script detection only. Needs an OSD traineddata file. The command-line tool does not print OSD output; use the API. Script detection reported as weak for some scripts. | https://groups.google.com/g/tesseract-ocr/c/25GQVGvEE2g and https://groups.google.com/g/tesseract-ocr/c/761tYES_lV0 (forum, secondary; OPINION-grade) |
| Pillow `ImageOps.exif_transpose`: if EXIF Orientation tag is other than 1, transpose the image and remove the orientation data. Default returns a new image; `in_place=True` modifies in place. | https://pillow.readthedocs.io/en/stable/reference/ImageOps.html |
| No primary-source measurement found of perspective crop + four-point transform improving VLM accuracy on receipts. | UNCONFIRMED |

---

## Q3. Zoom-in and multi-crop

| Fact | Source |
|---|---|
| ViCrop: adds one extra crop per question, concatenated with the original image tokens (not a replacement). Crop is a square box sized 1x to 2x of the model input resolution, chosen from an attention or gradient importance map. | https://arxiv.org/html/2502.17422v1 |
| ViCrop, LLaVA-1.5, TextVQA (no external OCR): 47.80 no crop; 55.17 rel-att; 56.06 grad-att. V*: 42.41 no crop; 62.30 rel-att; 57.07 grad-att. DocVQA: 15.97 no crop; 19.63 rel-att. | https://arxiv.org/html/2502.17422v1 |
| ViCrop cost, LLaVA-1.5 on RTX A6000, seconds per answer token: original 0.17; rel-att 1.16 (needs a second forward pass); grad-att 0.89; pure-grad 2.36. | https://arxiv.org/html/2502.17422v1 |
| ViCrop did not report Qwen-VL accuracy; Qwen appears only in an analysis section. | https://arxiv.org/html/2502.17422v1 |
| ZoomEye: training-free tree search; each child is a zoomed sub-region; MLLM navigates root to leaf. InternVL2.5-8B gains reported on HR-Bench: +15.71% and +17.69% (variant and absolute/relative not specified in abstract). Forward-pass count not in abstract. | https://arxiv.org/abs/2411.16044 |

---

## Q4. Contrast, illumination, binarization, CLAHE

| Fact | Source |
|---|---|
| No primary study found measuring binarization or CLAHE applied at inference to a general VLM for invoice/receipt extraction. | UNCONFIRMED |
| Arabic manuscript VLM study tests raw, adaptive binarization, CLAHE, denoising, sharpening, and combined, and asks whether preprocessing erases diacritics. Results not read. | https://arxiv.org/pdf/2608.22366 (snippet) |
| Historic Arabic OCR paper on a Qwen2-VL model: CER 0.10 with CLAHE and greedy decoding vs 0.12 without. CLAHE also used in fine-tuning, so effect is confounded. | https://aclanthology.org/2026.nakbanlp-1.43.pdf (snippet) |
| Classic OCR: a degraded-document paper says CLAHE can deform edges and add noise, and binarization degraded OCR in its tests (Tesseract-era pipeline). | https://arxiv.org/pdf/1901.09425 (snippet) |
| 2026 Brazilian-document LLM study notes binarization can remove faint characters, alter visual cues, or crop required fields. Results not read. | https://sol.sbc.org.br/index.php/eniac/article/download/46889/46646/ (snippet) |

---

## Q5. Self-consistency, multi-view voting, agreement

| Fact | Source |
|---|---|
| Test-time image augmentation with one MLLM for structured historical record extraction, giving improved results and a calibrated confidence score (snippet). Not invoices. | https://ar5iv.labs.arxiv.org/html/2509.09722 (snippet) |
| Self-consistency (sampling multiple responses and aggregating) as a confidence signal for multimodal models, compared with logit-based and verbalized confidence (snippet). | https://arxiv.org/pdf/2604.17274 (snippet) |
| Family-aware and calibration-weighted voting across VLMs; claims same-family models share correlated errors (snippet). | https://arxiv.org/html/2603.17111 (snippet) |
| IJDAR paper on KIE confidence in invoice-type documents uses conformal prediction (not voting). | https://jahrbib.sulb.uni-saarland.de/bitstream/20.500.11880/42305/1/s10032-026-00572-y.pdf (snippet) |
| Agreement between independent models used as a quality signal for historical document extraction (snippet). | https://arxiv.org/html/2605.25781 (snippet) |
| No paper found that measures two-view or two-model voting on invoice KIE accuracy and calibration together. | UNCONFIRMED |

---

## Q6. Hybrid input: PDF text layer + image vs image-only vs text-only

| Fact | Source |
|---|---|
| Berghaus et al., arXiv 2509.04469 (29 Aug 2025), "Multi-Modal Vision vs. Text-Based Parsing". Compares native image input vs text converted by Docling/SmolDocling (markdown), not a PDF text layer and not OCR-only. Models: GPT-5 family, Gemini 2.5 family, Gemma 3 4B and 12B. Datasets: Clean Invoices (Donut), Scanned Receipts (ICDAR-2019 SROIE), Scanned Invoices (inv-cdip). | https://arxiv.org/html/2509.04469 |
| Same paper, Table I, accuracy % native image / text: Scanned Receipts: gemini-2.5-pro 87.46 / 46.54; gemini-2.5-flash 82.15 / 47.00; gpt-5-chat 69.21 / 42.37; gemma-3-12b-it 66.91 / 41.48; gemma-3-4b-it 53.79 / 36.69. | https://arxiv.org/html/2509.04469 |
| Same paper, Clean Invoices, native / text: gemma-3-12b-it 84.66 / 84.91; gemma-3-4b-it 45.69 / 84.59; gpt-5-nano 86.45 / 85.45. Scanned Invoices: gemma-3-12b-it 82.09 / 61.21; gemini-2.5-pro 92.71 / 63.94. | https://arxiv.org/html/2509.04469 |
| Same paper reports no latency or cost figures. | https://arxiv.org/html/2509.04469 |
| Claude PDF: each page sent as text plus page image; "Claude receives an image of each page". | https://platform.claude.com/docs/en/build-with-claude/pdf-support |

Correction to the brief: arXiv 2509.04469 does not test image-only vs OCR-only vs PDF text layer. Its text arm is markdown conversion. On receipts, native image beat text conversion for every model listed; on clean invoices the two are close, except gemma-3-4b where text was far better.

---

## Q7. Multi-document files and page splitting

| Fact | Source |
|---|---|
| LLM page-stream segmentation: for each page the model decides continue vs new document; can use page text, page images, or both; prompt uses headers/footers and page numbers (snippet). Not invoice-specific. | https://arxiv.org/pdf/2609.22620 (snippet) |
| MADP pipeline: a splitter agent runs before parsing and separates logical units such as individual invoices in a batch (snippet). | https://arxiv.org/pdf/2605.17159 (snippet) |
| DocSplitAI: frames splitting merged PDFs as binary classification, using OCR-free Donut (snippet). | https://repository.ukim.mk/entities/publication/015edb08-ac09-4d4d-8a0e-9b42b3acde9b (snippet) |
| Claude PDF best practice: "Split large PDFs into chunks when needed". | https://platform.claude.com/docs/en/build-with-claude/pdf-support |

---

## Q8. QR / barcode on Indian e-invoices

| Fact | Source |
|---|---|
| CBIC Notification 10/2023-Central Tax (10 May 2023): e-invoicing for aggregate turnover above Rs 5 crore, effective 1 Aug 2023. Earlier cuts: Rs 500 cr (2020), Rs 50 cr (Notif 01/2022), Rs 20 cr, Rs 10 cr (Notif 17/2022). | https://www.businesstoday.in/amp/latest/economy/story/gst-e-invoicing-mandatory-for-businesses-with-aggregate-turnover-of-rs-5-crore-from-august-1-391659-2023-07-28 (snippet, secondary) |
| No 2025 or 2026 CBIC change to the threshold found in search. Current threshold status is not verified on a primary source. | UNCONFIRMED (check cbic-gst.gov.in) |
| IRN is a 64-character string (single secondary source). | https://dev.to/buildbyravirai/gst-e-invoicing-in-india-2026-how-irn-the-irp-api-and-qr-codes-actually-work-a-developers-5gcg (snippet, secondary) |
| Signed QR content, per secondary sources: supplier GSTIN, recipient GSTIN, invoice number, invoice date, invoice value, IRN. One blog adds item count and main HSN, and describes a JWT-style signed payload. | https://comtax.wb.gov.in/GST/e-invoicing/e-invoicing%E2%80%93AtAGlance-V1_1_20201112.pdf (snippet, state govt) and the dev.to link above (snippet) |
| Exact signed-payload field names and order: NIC/GSTN primary spec not found or fetched. | UNCONFIRMED |
| zxing-cpp: supports QR Code (Model 2 writes and reads; Model 1 read-only), Micro QR, rMQR. Apache-2.0. Page gives no accuracy comparison vs ZBar or OpenCV. | https://github.com/zxing-cpp/zxing-cpp |
| OpenCV WeChatQRCode vs OpenCV QRCodeDetector vs zxing-cpp accuracy: no primary benchmark found. Official OpenCV page returned 403. | UNCONFIRMED |

---

## Q9. Image format, HEIC, EXIF

| Fact | Source |
|---|---|
| Claude accepts JPEG, PNG, GIF, WebP. Animated GIF: first frame only. | https://platform.claude.com/docs/en/build-with-claude/vision |
| Claude per-image size limit: 8000x8000 px max; 5 MB base64 per image on Bedrock. | https://platform.claude.com/docs/en/build-with-claude/vision |
| pillow-heif: Pillow plugin for reading and writing HEIF, built on libheif. Plugin registration steps not read. | https://pillow-heif.readthedocs.io/en/latest/ |
| Pillow `exif_transpose` removes the Orientation tag after applying it. Other EXIF fields (GPS, etc.) not addressed on this page. | https://pillow.readthedocs.io/en/stable/reference/ImageOps.html |
| JPEG quality vs PNG for small printed text; EXIF/GPS stripping behaviour on save. | UNCONFIRMED (no primary source fetched) |

---

## Q10. Latency levers for API VLMs

| Fact | Source |
|---|---|
| Claude: each image adds visual tokens; downsampling "to minimize latency" is recommended; high-res uses up to ~3x tokens. | https://platform.claude.com/docs/en/build-with-claude/vision |
| Claude: resending base64 images every turn inflates payload and latency; Files API with `file_id` keeps payloads small. | https://platform.claude.com/docs/en/build-with-claude/vision |
| Claude prompt caching: cache hit requires 100% identical prefix including all text and images up to the cache_control block. Adding or removing images anywhere invalidates the cache. | https://platform.claude.com/docs/en/build-with-claude/prompt-caching |
| Claude cache pricing: 5-min write 1.25x base input; 1-hour write 2x; read 0.1x (Opus 5.5 and Sonnet 5.5: 0.05x; Fable 5.x: 0.025x). Default TTL 5 min, refreshed on use. | https://platform.claude.com/docs/en/build-with-claude/prompt-caching |
| Claude minimum cacheable prompt: 512 tokens (Haiku 5.5, Opus 5.5, Sonnet 5.5 and others), 1,024 (Sonnet 4.6, Opus 4.8), 2,048 (Opus 4.7), 4,096 (Haiku 4.5, Opus 4.6). Shorter prompts are silently not cached. | https://platform.claude.com/docs/en/build-with-claude/prompt-caching |
| GLM-4.5V: `thinking: {type: enabled}` switches to deep reasoning; no `disabled` value shown on the page. Max output listed as 16K. | https://docs.z.ai/guides/vlm/glm-4.5v |
| GLM-4.6V: same `thinking` example; no reasoning-effort or image-token documentation found. | https://docs.z.ai/guides/vlm/glm-4.6v |
| ViCrop per-token cost numbers (Q3) give a measured latency multiplier for extra crops on an older model. | https://arxiv.org/html/2502.17422v1 |
| Content-hash cache keys for extraction results: not a vendor feature; no primary source needed beyond caching behaviour above. | UNCONFIRMED as a recommendation (no source) |
| OpenAI reasoning-effort settings and latency: not fetched. | UNCONFIRMED |

---

## OPINION (blog, forum, vendor marketing; not verified)

- High-resolution images consume more input tokens on GLM-4.5V; gateway listing says so without figures. (https://vercel.com/ai-gateway/models/glm-4.5v/api)
- Running the same document through a vision model with several prompts and voting across results works for invoices. (https://dzone.com/articles/accurate-invoice-data-extraction)
- Split-then-classify-then-extract with per-segment confidence; send only low-confidence segments to an LLM. (https://www.nutrient.io/blog/mailroom-automation-api/)
- Turnover threshold is Rs 10 crore and above on one vendor page; conflicts with the 2023 notification. Treat as wrong until checked. (https://tallysolutions.com/gst/e-invoicing-threshold/)
- Tesseract script detection is unreliable for some scripts. (https://groups.google.com/g/tesseract-ocr/c/761tYES_lV0)

---

## UNCONFIRMED (needs a primary source before any decision)

1. Gemma 4 patch pixel size and aspect-ratio handling.
2. Qwen2.5-VL default min/max pixels for the official model (conflicting HF configs; see Q1).
3. Any GLM-5.x image resolution or detail parameter (GLM-5.x docs not fetched).
4. Any published "sweet spot" resolution for small-text accuracy across models.
5. Whether crop/deskew/four-point transform improves VLM extraction on receipts (no primary measurement found).
6. Whether binarization or CLAHE helps or hurts general VLM extraction at inference.
7. Two-view or two-model voting effect on invoice KIE accuracy and calibration.
8. Exact NIC/GSTN signed QR payload field names and order.
9. Current e-invoice turnover threshold after 10/2023 (no 2025-2026 notification found in search).
10. Relative accuracy of zxing-cpp vs OpenCV vs WeChatQRCode on Indian e-invoice QR codes.
11. JPEG quality vs PNG effect on VLM text reading.
12. EXIF/GPS stripping behaviour when saving with Pillow or pillow-heif.
13. OpenAI reasoning-effort settings and their latency effect.
14. Tesseract OSD and docTR orientation accuracy on phone photos of receipts (no measured comparison found).
15. Multi-invoice page-splitting accuracy for VLMs on invoices (only general page-stream papers found).
