# OCR models 2026: does anything beat PP-OCRv6 for Indian bills on CPU?

Researched 2026-11-21 from web pages only. Nothing was downloaded or run. Each claim has a source URL. Where a fact could not be confirmed it says "not stated".

## Bottom line

- No source found shows any open-weights model beating PP-OCRv6 on Indian shop bills. No public Indian-bill benchmark exists, so every ranking below is on other data.
- The VLM OCR models (PaddleOCR-VL-1.6, GLM-OCR, Chandra 2, dots.mocr, Surya 2.5, LightOnOCR-2, FireRed-OCR) top document benchmarks. Those benchmarks are clean pages (OmniDocBench, olmOCR-bench), not thermal receipts or phone photos.
- On CPU the VLMs cost tens of seconds to minutes per page. PP-OCRv6 costs 0.2 to 3.3 s. Only PaddleOCR-VL-1.6 and LightOnOCR-2 have a documented CPU ONNX path.
- The only receipt head-to-head found (vendor-run, SROIE, GPU) has line-OCR engines at or ahead of the VLMs on character error rate.
- One cheap win for the current stack: RapidOCR issue #743 reports PP-OCRv6 `rec_medium` and `det_small` ONNX files run 4 to 12x slower on CPU than they should because of denormal weights.

## Baseline: PP-OCRv6

| Item | Value | Source |
|---|---|---|
| Release | PaddleOCR 3.7.0, 2026-06-11 | https://github.com/PaddlePaddle/PaddleOCR/wiki |
| Params, det / rec / total | tiny 0.43M / 1.1M / 1.5M; small 2.48M / 5.2M / 7.7M; medium 15.5M / 19M / 34.5M | https://arxiv.org/html/2606.13108 |
| Accuracy (Baidu in-house multi-scenario set, not public) | recognition medium 83.2, small 81.3, tiny 73.5; detection Hmean 86.2 / 84.1 / 80.6 | https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html |
| CPU, Xeon 8350C, seconds per image, end to end | ONNX Runtime: medium 3.31, small 0.61, tiny 0.22. OpenVINO: medium 1.40, small 0.59, tiny 0.20 | same page |
| Licence | Apache-2.0 (recognition model card) | https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec |
| Languages | 50: Chinese, English, Japanese, 46 Latin-script. No Indic scripts mentioned | https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html |
| Receipts | Not evaluated in the paper. Handwriting is only tested in Chinese and English | https://arxiv.org/html/2606.13108 |
| Boxes | Detector polygons, line-level ("oriented text lines" in the paper); word boxes exist but are imprecise (see below) | https://arxiv.org/html/2606.13108 |

Failure reports from users:

- Word boxes: PaddleOCR issue 18378 says `returnWordBox` on medium is far less precise than Tesseract on the same page. https://github.com/PaddlePaddle/PaddleOCR/issues/18378
- Small invoice text: issue 18320 says tiny misses small, narrow-column invoice text. Small det plus small rec is accurate but slow. On a 4 vCPU cloud instance, Paddle CPU latency was 7 to 9 s per request. No maintainer reply. https://github.com/PaddlePaddle/PaddleOCR/issues/18320
- Latin spacing: RapidOCR issue 723 says the v6 small recogniser drops spaces between words compared with v5 mobile. https://github.com/RapidAI/RapidOCR/issues/723
- Cross-runtime drift: RapidOCR issue 701 says the same image gave different text in RapidOCR and Paddle. https://github.com/RapidAI/RapidOCR/issues/701
- Fine-tuning helps receipts: a Japanese-receipt fine-tune reports 88.9% exact match against 71.4% for stock v6 medium on its own text-line set. Internal test, different language. https://huggingface.co/IRUCAAI/ope_ocr
- Android preprocessing used RGB where training used BGR (issue 18380). Check channel order in any custom Node pipeline. https://github.com/PaddlePaddle/PaddleOCR/issues/18380
- CPU speed bug in the ONNX files: `rec_medium` (about 197k denormal weights) and `det_small` (about 256k) run slow. One reporter measured `rec_medium` at 3,713 ms falling to 329 ms per page after zeroing them, with identical output. `det_small` went 1,139 to 301 ms. Still open, milestone v3.11.0. Workaround: zero the denormal initialisers, or set session option `session.set_denormal_as_zero=1` (helps at 4 threads, little at 1). https://github.com/RapidAI/RapidOCR/issues/743
- RapidOCR added v6 in 3.9.0 and made small det and rec the default. https://newreleases.io/project/github/RapidAI/RapidOCR/release/v3.9.0
- `@gutenye/ocr-node`: no v6 issue found. The only issue on newer PP-OCR asks about v5 (closed). The npm mirror README describes PP-OCRv4 models. https://github.com/gutenye/ocr/issues/39 and https://npmjs.com/package/@tzmax/ocr-node
- Licence of the converted ONNX files bundled with RapidOCR: asked in issue 739, closed with a commit adding "licensing metadata". The answer was not readable. Check before shipping. https://github.com/RapidAI/RapidOCR/issues/739

## Candidates

Box granularity key: word, line, region (layout block), none, unknown.

| Model | Params / size | Boxes | CPU | ONNX / Node | Licence | Receipt evidence |
|---|---|---|---|---|---|---|
| PaddleOCR-VL-1.6 | 0.9 to 1.0B | line-level "Spotting:" task (vLLM recipe says line-level); output schema not confirmed | slow, see below | community ONNX int8, onnxruntime only (Python script) | Apache-2.0 | one vendor run: CER 0.337 on SROIE |
| GLM-OCR | 0.9 to 1.0B | none on the card (layout comes from PP-DocLayoutV3 in the SDK) | unreported | community ONNX (Python only) | MIT | none |
| Chandra 2 | about 5B | layout-level, unspecified | none given | none | weights under modified OpenRAIL-M, free below $2M funding/revenue; cannot compete with Datalab API | none |
| Surya 2.5 | 0.69B | line boxes from a detection model; block-level OCR | llama.cpp, one blog: 138 s per image on N100 | none | weights under modified OpenRAIL-M, free below $5M | none on card |
| dots.mocr | 3B | layout blocks with `[x1,y1,x2,y2]`; no word or line level documented | CPU issue linked, no numbers | none | MIT | none |
| LightOnOCR-2-1B(-bbox) | about 1B | bbox only for embedded images, not text | CPU via Rust ONNX wrapper | `onnx-community/LightOnOCR-2-1B-ONNX`, Python package | Apache-2.0 | SROIE example, no metrics |
| DeepSeek-OCR-2 | 3B | grounding prompt, format not documented | NVIDIA only on the card | none | Apache-2.0 | none |
| Xiaomi-OCR-0 | 0.9B | none documented | float32 CPU path in the example; GGUF unverified | none | Apache-2.0 | one receipt example, JSON for date, GST ID, total |
| FireRed-OCR | 2B | trained for detection and region OCR; format not documented | not covered | none | Apache-2.0 | none |
| Nemotron OCR v2 | 54M English / 84M multilingual | word-level (English) or line-level (multilingual) with quads | NVIDIA GPU and CUDA build required | none | NVIDIA Open Model License, "ready for commercial use" | none |
| Unlimited-OCR-2 | 3B | none documented | CUDA | none | MIT | none |
| TeleOCR | about 1.4B | none documented | ONNX CPU 57 tok/s on a 16-core desktop | community ONNX with transformers.js | Apache-2.0 | none |
| OneOCR-20260515 | not stated | not stated | not stated | not stated | not read (card needs login) | card warns it may alter digits, prices, totals, dates, IDs |
| docTR / OnnxTR | classic, small | word-level | CPU, about 0.1 to 0.6 s per page in the project's own table | Python (OnnxTR) | Apache-2.0 | vendor SROIE CER 0.197 |

Sources by row:

- PaddleOCR-VL-1.6: card https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6 ; spotting description https://recipes.vllm.ai/PaddlePaddle/PaddleOCR-VL-1.5 ; ONNX https://huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX (426 MB vision int8, 346 MB decoder int8, 404 MB embedding fp32). CPU time 72 s per page (92 s in its caveats) on an Intel Core Ultra, 13 hard pages read region by region, and int8 degrades on full pages, so it must be fed regions. The author also reports an invented table. One Mac CPU run took about 33 s for a page: https://thakicloud.github.io/en/research/paddleocr-vl-09b-multilingual-document-parsing/ (the page returned 404 when fetched later; the figure came from a search summary, treat as unconfirmed).
- GLM-OCR: card https://huggingface.co/zai-org/GLM-OCR ; ONNX https://huggingface.co/ningpp/GLM-OCR-ONNX . The ONNX page lists only text, formula and table prompts. Card speed claims are 1.86 pages/s for PDFs and 0.67 images/s, on the authors' own hardware.
- Chandra 2: https://huggingface.co/datalab-to/chandra-ocr-2 . Hindi 78.4 and Tamil 77.7 on Datalab's own 43-language table, below Gemini 2.5 Flash on Hindi (82.7).
- Surya 2.5: https://huggingface.co/datalab-to/surya-ocr-2.5 ; CPU time from a Korean-language blog, single run, found through a search summary https://wikidocs.net/441138 (the page returned 403, not verified). The same blog gave Surya CER 0.017 at 137.84 s per image against PaddleOCR 0.105 at 7.93 s on that machine, on its own documents (not receipts).
- dots.mocr: https://huggingface.co/rednote-hilab/dots.mocr
- LightOnOCR-2: https://huggingface.co/lightonai/LightOnOCR-2-1B-bbox ; CPU wrapper https://pypi.org/project/fast-lightonocr/ . No LightOnOCR-3 was found.
- DeepSeek-OCR-2: https://huggingface.co/deepseek-ai/DeepSeek-OCR-2 (ParseBench-2 mean 41.2, olmOCR-bench 76.3, both listed on the card).
- Xiaomi-OCR-0: https://huggingface.co/xiaomi-research/Xiaomi-OCR-0 (card benchmarks are the authors' own, 92.73 versus 95.24 on the same benchmark is unexplained on the card).
- FireRed-OCR: https://huggingface.co/FireRedTeam/FireRed-OCR (74.62 on its own FireRedBench against 76.47 for PaddleOCR-VL-1.5).
- Nemotron OCR v2: https://huggingface.co/nvidia/nemotron-ocr-v2 . On OmniDocBench, PaddleOCR v5 beats the multilingual variant on English (NED 0.027 vs 0.048). No Indic scripts.
- Unlimited-OCR-2: https://huggingface.co/baidu/Unlimited-OCR-2 (ParseBench-2 overall 64.39).
- TeleOCR ONNX: https://huggingface.co/stefanj0/TeleOCR-ONNX (q4f16 1.77 GB; 4-bit vision encoder hurts OCR).
- OneOCR: https://huggingface.co/Onescaling/OneOCR-20260515 (via search summary; the page itself returned 401).
- docTR / OnnxTR: https://github.com/felixdittrich92/OnnxTR (old versions in the README table, so treat as indicative).

Not relevant for extraction: MiniCPM-OCR-Jev is a 2B verifier that scores candidate OCR outputs, it does not read pages. https://huggingface.co/openbmb/MiniCPM-OCR-Jev

Not covered, no useful evidence found in the pages read: Nanonets-OCR, olmOCR 2 (8B, English only, listed in https://huggingface.co/blog/ocr-open-models, dated 2025-10), Florence-2, Moondream, Qwen3-VL 2B/4B grounding. For Qwen3-VL-2B there is only a CORD fine-tune with field F1 0.886 on 100 receipts, self-reported: https://huggingface.co/ratlinghitman/qwen3vl-2b-receipt-extraction . Nothing found on word-level box accuracy for any of them.

## Benchmarks: who ran them, and why they do not transfer

- OmniDocBench v1.6: PaddleOCR-VL-1.6 96.33, authors evaluated it and two others, rest cited from the leaderboard. https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6 . GLM-OCR 94.62 on v1.5, self-reported. https://huggingface.co/zai-org/GLM-OCR . Clean digital and scanned pages. An audit paper reports about 12% of its evaluated blocks carry annotation errors (via search summary of https://arxiv.org/html/2603.10910, not opened).
- olmOCR-bench: Chandra 2 85.8, dots.mocr 83.9, DeepSeek-OCR-2 76.3, GLM-OCR 75.2, all from model cards (own runs). English PDFs.
- MDPBench (3,400 photographed and digital pages, 17 languages, run by HUST and Kingsoft): photographed pages average a 17.8% drop and the best open model, dots.mocr, trails Gemini-3-Pro by 7.9% on photographed. https://arxiv.org/html/2603.28130v1 . GLM-OCR scored 63.7 on its photographed subset. A PP-StructureV3 row scored far lower than the VLMs, but column headers were lost, so this is unconfirmed. https://huggingface.co/datasets/Delores-Lin/MDPBench/blob/main/README.md
- Only receipt head-to-head found: vendor-run (the vendor sells a product), RTX 4090, SROIE 2019 English, one run, no significance tests. CER: Surya2 0.191, docTR 0.197, PaddleOCR 3.7.0 0.204, EasyOCR 0.283, Tesseract 0.335, PaddleOCR-VL-1.6 0.337, Docling 0.591, Unlimited-OCR 0.655. The page itself says the gaps do not show which system understands receipts better, and not to extend results to invoices. https://imagetotable.ai/references/traditional-ocr-vs-document-parsing-vlm
- PP-OCRv6 paper: Baidu in-house set only. Recognition accuracy shown for Qwen3-VL-235B 74.9, Gemini-3.1-Pro 71.4, GPT-5.5 64.2, against medium 83.2. It compares nothing against PaddleOCR-VL or GLM-OCR. https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html
- ReceiptBench (ACL 2026, 10k receipts and invoices, 19 fields): exists, results not readable from the PDF here. Worth reading by hand. https://arxiv.org/abs/2605.22413 ; code https://github.com/wwwT0ri/ReceiptBench
- Indian data: no published benchmark of open models on Indian GST invoices was found. A Hugging Face forum thread lists some GST invoice projects but no results. https://discuss.huggingface.co/t/seeking-indic-document-dataset-india-invoices-receipts-utility-bills-payment-advices-packing-lists-commercial-invoices-credit-notes/177055

## OCR-free KIE models for receipts

Nothing new and open surfaced for 2026 apart from fine-tunes (the Qwen3-VL-2B CORD one above). GLM-OCR and Xiaomi-OCR-0 take a JSON schema prompt for extraction, but neither returns boxes and neither reports receipt scores. GLM-OCR's card warns the output must follow its strict JSON schema. Hallucinated digits is the main risk: the OneOCR card warns of it directly, and a 2026 guide notes VLM OCR can produce plausible-looking wrong text. https://slavadubrov.github.io/blog/2026/03/04/the-definitive-guide-to-ocr-in-2026-from-pipelines-to-vlms

## Forum coverage gaps

- Reddit could not be fetched (blocked), so no r/LocalLLaMA or r/computervision thread is cited.
- No Hacker News thread about open-weights receipt OCR was found. The one HN-linked item, a closed-API benchmark of 18 models, is out of scope.
- No GitHub issue was found about PP-OCRv6 on Indian documents or on thermal paper. The issues above are the first-hand evidence available.

## Practical notes for Dues

- Box need: only the line-box engines (PP-OCRv6, docTR, Surya detection) give boxes that are verified to exist. VLM "spotting" and grounding output for PaddleOCR-VL is documented only at the prompt level, and the user's own bake-off already found GLM grounding boxes off on raster totals.
- A two-stage design (line OCR for boxes, VLM to re-read only the cropped value) is plausible but unmeasured. The int8 PaddleOCR-VL ONNX author says to feed regions of about 200 image tokens, not full pages.
