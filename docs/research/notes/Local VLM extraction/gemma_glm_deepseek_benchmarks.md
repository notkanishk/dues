# Vision / document-understanding benchmarks: Gemma 4 31B vs GLM-5.3-Flash vs DeepSeek V4.1 Flash

Research date context: 2026-11-20. Facts only, no recommendation.

Scope rules used:
- Each number is tagged with the exact model variant it belongs to. Numbers from an official lineage model (a different model) sit in the last column, labelled with that model's name.
- Every number carries the URL it came from. Anything not from a primary source (model card, official tech report, official leaderboard, or official blog) is marked UNCONFIRMED and listed in the last section.
- "not reported" means the benchmark does not appear on that model's primary source as fetched. It does not prove the number was never published elsewhere.

Model IDs:
- Gemma: `google/gemma-4-31B-it` (instruct), `google/gemma-4-31B-it-qat-w4a16-ct` (QAT w4a16).
- GLM-5.3-Flash: `zai-org/GLM-5.3-Flash` (MIT license). The Z.ai API name is `glm-5.3-flash`.
- DeepSeek V4.1 Flash: `deepseek-ai/DeepSeek-V4.1-Flash` on Hugging Face. The official API name in the DeepSeek news post is `deepseek-flash`; the third-party name `deepseek-v4.1-flash` is not an official DeepSeek API name (UNCONFIRMED mapping).

## 1. Side-by-side table

Abbreviations for source links:
- [G-HF](https://huggingface.co/google/gemma-4-31B-it): Gemma 4 31B-it card
- [G-QAT](https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct): Gemma 4 31B QAT w4a16 card
- [G-Card](https://ai.google.dev/gemma/docs/core/model_card_4): Gemma 4 model card (redirects to https://gemma.ai/models/gemma-4/model-card/, same numbers)
- [Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash): GLM-5.3-Flash card
- [Z-Docs](https://docs.z.ai/guides/llm/glm-5.3-flash): Z.ai GLM-5.3-Flash guide
- [DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash): DeepSeek V4.1 Flash card
- [DS-News](https://deepseek.com/en/news/deepseek-v4-1-flash/): DeepSeek V4.1 Flash announcement (2026-09-10)
- [GLM-4.5V report](https://arxiv.org/html/2507.01006): GLM-4.5V / GLM-4.1V-Thinking tech report (lineage)
- [GLM-5V-Turbo report](https://arxiv.org/html/2604.26752): GLM-5V-Turbo tech report (lineage)
- [VL2 paper](https://arxiv.org/html/2412.10302): DeepSeek-VL2 paper (lineage)

| Benchmark | Gemma 4 31B-it | GLM-5.3-Flash | DeepSeek V4.1 Flash | Lineage numbers (different model, labelled) |
|---|---|---|---|---|
| OCRBench (v1) | not reported ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | not reported ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)) | not reported ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | GLM-4.5V (thinking) 86.5; GLM-4.1V-9B-Thinking 84.2 ([GLM-4.5V report](https://arxiv.org/html/2507.01006)). DeepSeek-VL2 full 811, Small 834, Tiny 809 ([VL2 paper](https://arxiv.org/html/2412.10302)) |
| OCRBench v2 | not reported | not reported | not reported | No entry for any of the three on the official leaderboard checked ([OCRBench v2 repo](https://github.com/Yuliang-Liu/MultimodalOCR)) |
| DocVQA | not reported ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | not reported ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)) | 95.6, "DocVQA (LLM-Judge)", 4-shot, **base** model ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | DeepSeek-VL2 full 93.3, Small 92.3, Tiny 88.9 ([VL2 paper](https://arxiv.org/html/2412.10302)) |
| InfoVQA | not reported | not reported | not reported | DeepSeek-VL2 full 78.1, Small 75.8, Tiny 66.1 ([VL2 paper](https://arxiv.org/html/2412.10302)) |
| ChartQA | not reported | not reported | not reported as ChartQA. "Chartography w/ tools (Pass@1)" 78.9 is an agent benchmark, not ChartQA ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | DeepSeek-VL2 full 86.0, Small 84.5, Tiny 81.0 ([VL2 paper](https://arxiv.org/html/2412.10302)). ChartQAPro: GLM-4.5V 64.0, GLM-4.1V 59.5 ([GLM-4.5V report](https://arxiv.org/html/2507.01006)) |
| OmniDocBench 1.5 (avg edit distance, lower = better) | **0.131** ([G-HF](https://huggingface.co/google/gemma-4-31B-it), [G-Card](https://ai.google.dev/gemma/docs/core/model_card_4)) | not reported | not reported | Different OmniDocBench version: DeepSeek-OCR 2 on v1.6 end-to-end, overall 90.25 ([OmniDocBench repo](https://github.com/opendatalab/OmniDocBench)). Not comparable to 0.131 |
| ParseBench (LlamaIndex, document parsing) | not reported | Mean 70.75; Text Content 88.34; Text Formatting 79.49 ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)) | not reported | none |
| CC-OCR | not reported | not reported | not reported | none |
| MMMU (val, standard) | not reported; only "MMMU Pro" row ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | not reported | not reported | GLM-4.5V (thinking) 75.4; GLM-4.1V (thinking) 68.0 ([GLM-4.5V report](https://arxiv.org/html/2507.01006)). DeepSeek-VL2 full 51.1 ([VL2 paper](https://arxiv.org/html/2412.10302)) |
| MMMU-Pro | **76.9** ([G-HF](https://huggingface.co/google/gemma-4-31B-it)); thinking setting not stated | not reported as absolute. GLM-5V-Turbo gets only relative gains ([GLM-5V-Turbo report](https://arxiv.org/html/2604.26752)) | 56.5, "MMMU-Pro (EM)", 4-shot, **base** model ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | GLM-4.5V (thinking) 65.2; GLM-4.1V (thinking) 57.1 ([GLM-4.5V report](https://arxiv.org/html/2507.01006)) |
| MathVista | not reported | not reported as absolute. GLM-5V-Turbo gets only a grouped relative gain (+1.8%) ([GLM-5V-Turbo report](https://arxiv.org/html/2604.26752)) | not reported | GLM-4.5V (thinking) 84.6; GLM-4.1V (thinking) 80.7 ([GLM-4.5V report](https://arxiv.org/html/2507.01006)). DeepSeek-VL2 full 62.8 ([VL2 paper](https://arxiv.org/html/2412.10302)) |
| CharXiv | not reported | not reported as absolute. GLM-5V-Turbo relative +7.7% over SFT only ([GLM-5V-Turbo report](https://arxiv.org/html/2604.26752)) | not reported | none |
| MATH-Vision | **85.6** ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | not reported | not reported | none |
| MedXPertQA MM | **61.3** ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | not reported | not reported | none |
| SROIE / CORD (receipt KIE) | not reported | not reported | not reported | none found in search (not exhaustively checked) |
| Hindi / Devanagari OCR | not on any official source | not reported | not reported | Gemma 4 Hindi 85.03 per vendor blog (UNCONFIRMED, see section 4). Devanagari stress-test paper ([arXiv 2606.29213](https://arxiv.org/pdf/2606.29213)) does not cover the three models |
| LMArena Vision (Arena) | Score 1265, rank #41 ([Arena](https://arena.ai/leaderboard/chat/vision/models/glm-5.3-flash-7tm0), ranking list as of 2026-11-20) | Score 1274 ±5, rank #36 of 168, 36,497 votes, updated 2026-11-20 ([Arena](https://arena.ai/leaderboard/chat/vision/models/glm-5.3-flash-7tm0)) | not listed on that page | none |
| Image resolution / visual token budget | Variable aspect ratio. Budgets 70, 140, 280, 560, 1120 visual tokens. Higher budgets recommended for OCR ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | Not stated. BabyVision footnote: shorter side resized to at least 1.5K px ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)) | Not stated on official card. Third-party says up to about 1344×1344 (UNCONFIRMED, section 4) ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | VL2: 384×384 tiles plus a thumbnail, up to 9 tiles, disabled above 2 images ([VL2 paper](https://arxiv.org/html/2412.10302)). DeepSeek-OCR: presets 512/640/1024/1280, plus "Gundam" crop mode ([DS-OCR card](https://huggingface.co/deepseek-ai/DeepSeek-OCR)) |
| Parameters (total / active) | 30.7B total, dense; vision encoder ~550M; safetensors metadata shows 33B ([G-HF](https://huggingface.co/google/gemma-4-31B-it), [G-QAT](https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct)) | 320B total, 18B active; safetensors 321B ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)) | 552B backbone; 8B active in prefill, 16B in decode; safetensors 763B ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash), [DS-News](https://deepseek.com/en/news/deepseek-v4-1-flash/)) | VL2: LLM total 3B / 16B / 27B; activated 1.0B / 2.8B / 4.5B ([VL2 paper](https://arxiv.org/html/2412.10302)). GLM-4.5V: 106B total, 12B active ([GLM-4.5V report](https://arxiv.org/html/2507.01006)) |
| Context length | 256K ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | 1M tokens; max output 128K ([Z-Docs](https://docs.z.ai/guides/llm/glm-5.3-flash)). Model card itself does not state it | 1M ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | none |
| Thinking mode in reported numbers | Not stated. Thinking toggled by `<\|think\|>` token in system prompt ([G-HF](https://huggingface.co/google/gemma-4-31B-it)) | Default `reasoning_effort` is `max`. Card says keep `max` for benchmark reproduction, but does not confirm it for every result ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)) | Instruct results use `reasoning_effort=100` (max). Base-model rows are not thinking ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)) | GLM-4.5V and GLM-4.1V: thinking, explicit ([GLM-4.5V report](https://arxiv.org/html/2507.01006)). DeepSeek-VL2: thinking not mentioned ([VL2 paper](https://arxiv.org/html/2412.10302)) |
| Quantized variant quality vs bf16 | QAT w4a16 official card: no bf16-vs-QAT table and no quantified loss. Only the claim of "similar quality to bfloat16" ([G-QAT](https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct)) | Not applicable (no official quantized variant checked) | Not applicable (no official quantized variant checked) | none |

## 2. Per-model notes

### Gemma 4 31B-it (`google/gemma-4-31B-it`)
- Modalities: text and image input, text output. No audio on 31B ([G-HF](https://huggingface.co/google/gemma-4-31B-it)).
- Vision encoder: about 550M parameters, shared design with the 26B A4B model ([G-HF](https://huggingface.co/google/gemma-4-31B-it)).
- Vision rows published: MMMU-Pro 76.9, OmniDocBench 1.5 0.131, MATH-Vision 85.6, MedXPertQA MM 61.3 ([G-HF](https://huggingface.co/google/gemma-4-31B-it)). Gemma 3 27B on OmniDocBench 1.5 is 0.365 on the same table, lower is better ([G-HF](https://huggingface.co/google/gemma-4-31B-it)).
- Not on the card: OCRBench, DocVQA, InfoVQA, ChartQA, CC-OCR, standalone MMMU, MathVista, CharXiv ([G-HF](https://huggingface.co/google/gemma-4-31B-it)).
- Arena vision: 1265, rank #41 ([Arena](https://arena.ai/leaderboard/chat/vision/models/glm-5.3-flash-7tm0)).
- QAT w4a16 (`google/gemma-4-31B-it-qat-w4a16-ct`, Apache 2.0): compressed-tensors w4a16 format, base model `google/gemma-4-31B`, parent `google/gemma-4-31B-it-qat-q4_0-unquantized`. Card says "similar quality to bfloat16" qualitatively, with no numbers ([G-QAT](https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct)). The QAT card's benchmark table is the same Gemma 4 31B table, not labelled as QAT or bf16 ([G-QAT](https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct)). No quality-loss figure from a primary source.

### GLM-5.3-Flash (`zai-org/GLM-5.3-Flash`)
- Described as "the first natively multimodal model in the GLM-5 series". Image input supported via `image_url` blocks ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash), [Z-Docs](https://docs.z.ai/guides/llm/glm-5.3-flash)).
- The HF card's benchmark table is an image and was not readable. The only vision rows in readable text are ParseBench (Mean 70.75; Text Content 88.34; Text Formatting 79.49) ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)). No OCRBench, DocVQA, ChartQA, OmniDocBench, MMMU, MathVista or CharXiv rows in readable text ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash)).
- Non-vision readable scores (for context only): DeepSWE 63.4; AutomationBench 48.8; Terminal-Bench 2.1 84.3 ([Z-HF](https://huggingface.co/zai-org/GLM-5.3-Flash), [Z-Docs](https://docs.z.ai/guides/llm/glm-5.3-flash)).
- Arena vision: 1274 ±5, rank #36 of 168, 36,497 votes, updated 2026-11-20 ([Arena](https://arena.ai/leaderboard/chat/vision/models/glm-5.3-flash-7tm0)). An earlier search snippet showed 1272 and 31,530 votes; the live page value is used here.
- Lineage, GLM-5V-Turbo (a different model, released April 2026): the tech report gives only relative gains over SFT for OCRBench (+4.2%), CharXiv (+7.7%), STEM group (+1.8%), and no absolute OCR or document scores ([GLM-5V-Turbo report](https://arxiv.org/html/2604.26752)).
- Lineage, GLM-4.5V and GLM-4.1V-Thinking (different models): absolute scores in section 1 ([GLM-4.5V report](https://arxiv.org/html/2507.01006)). GLM-4.6V (106B) card has no readable tables ([GLM-4.6V card](https://huggingface.co/zai-org/GLM-4.6V)).

### DeepSeek V4.1 Flash (`deepseek-ai/DeepSeek-V4.1-Flash`)
- Official announcement, 2026-09-10: "native visual understanding" and "native multimodal support". V4-Flash and V4-Flash-Vision-Exp retired ([DS-News](https://deepseek.com/en/news/deepseek-v4-1-flash/)). So image input is part of the official model, not a bolt-on text-only model.
- The announcement says it is "the smallest model in our new architecture family". The card gives a 552B backbone. These two statements conflict on size, and the card is the more specific source (noted, not resolved).
- Vision encoder: DeepSeek-ViT. Pipeline tag Image-Text-to-Text ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)).
- Vision rows on the card, all on the **base** model, 4-shot unless noted: MMMU-Pro (EM) 56.5; CVBench (EM) 77.9; DocVQA (LLM-Judge) 95.6; RefCOCO-avg (Acc@0.5, 0-shot) 86.0 ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)).
- Instruct model visual agent rows, max reasoning effort: Chartography w/ tools (Pass@1) 78.9; BabyVision w/ tools (Pass@1) 89.6; ZeroBench-main w/ tools (Pass@5) 49.0 ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)).
- The announcement page has benchmark images only; no readable vision table ([DS-News](https://deepseek.com/en/news/deepseek-v4-1-flash/)).
- No OCRBench, InfoVQA, ChartQA, OmniDocBench, CC-OCR, MathVista, CharXiv or Hindi OCR rows found on the card ([DS-HF](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)).

## 3. Caveats on comparability

- Gemma and DeepSeek vision numbers in this table are not on the same benchmark rows. Only OmniDocBench-family and MMMU-Pro show up for two models, and even then the versions and settings differ (Gemma: OmniDocBench 1.5, instruct, thinking setting unstated; DeepSeek: MMMU-Pro, base, 4-shot, no OmniDocBench at all). No row has verified numbers for all three models.
- GLM-5.3-Flash has no absolute vision benchmark number on a primary source in readable form. Its card's benchmark table is an image.
- Lineage numbers (GLM-4.5V, GLM-4.1V, GLM-5V-Turbo, DeepSeek-VL2, DeepSeek-OCR) are different models and are not comparable to the three target models as-is.

## 4. UNCONFIRMED

Not from a primary source, or the primary source could not be read. Each has its source.

- Gemma 4 31B Hindi/Devanagari OCR: 85.03. Source: vendor blog [Sarvam Vision 2.1](https://www.sarvam.ai/blogs/sarvam-vision-2-1). Vendor comparison, not an official benchmark.
- GLM-5.3-Flash Roboflow Vision Evals: average 55.8% on a five-task set, single run per task, re-run pending. Source: [Roboflow](https://playground.roboflow.com/models/z-ai/glm-5-3-flash). Third-party.
- MMMU-Pro 72.8% for GLM-5V-Turbo reasoning variant. Source: [Artificial Analysis](https://artificialanalysis.ai/models/releases/glm-5v-turbo) (search snippet only, page not fetched). Third-party; the variant is GLM-5V-Turbo, not GLM-5.3-Flash.
- DeepSeek V4.1 Flash image resolution "up to roughly 1344 × 1344". Source: trade-press coverage via search ([The Decoder](https://the-decoder.com/deepseek-releases-experimental-flash-vision-model-that-rivals-opus-4-8-on-agent-benchmarks/), search snippet). Not on the official card.
- DeepSeek V4.1 Flash vision benchmarks from the earlier V4-Flash-Vision-Exp (ApexBench 36.5 vs 26.2; Agents' Last Exam 27.3 vs 25.2; security benchmark 75.3 vs 76.7). These belong to the predecessor, not V4.1 Flash. Source: [TheNextWeb](https://thenextweb.com/news/deepseek-v4-flash-vision-exp-opus-benchmarks), search snippet only. Not fetched.
- DeepSeek V4.1 Flash "552B" vs "smallest model in our new architecture family" (section 2): the conflict is in the primary sources themselves; not resolved.
- Third-party API name `deepseek-v4.1-flash`: the official name in the DeepSeek announcement is `deepseek-flash`. Mapping from third-party name to official model is not confirmed.
- Arena Gemma 4 31B score 1265 and rank #41: read from the GLM-5.3-Flash Arena page's ranking list on 2026-11-20. Arena is the official LMArena vision board, but the Gemma entry was taken from a page centred on GLM. Treat as lightly confirmed.
- Roboflow OCR leaderboard "DeepSeek V4 Flash Vision variant" 44.7%: third-party, not a V4.1 Flash score, and not on a primary source.
- Gemma 4 QAT w4a16 quality loss vs bf16: no number exists on the primary QAT card. Community claims (GotoAI-Inc comparison, lew96123 writeup) are not primary and were not used.
- SROIE, CORD and other receipt KIE results for any of the three models: none found in search. Not exhaustively checked.
- OCRBench v2 and OmniDocBench leaderboards: fetched pages showed no entries for the three models. Leaderboard images could not be read, so this is not fully confirmed.
- Not in any readable source: CC-OCR, MMBench for any of the three target models, CharXiv absolute scores for any of the three target models.

## Deduction for Dues (2026-11-20, inference, not measured)

Measured on our 42-bill gold set (BharatCode API, 2 runs): GLM-5.3 Flash total 95–97%, total+date+bill no 79–82%, handwritten 62%; DeepSeek V4.1 Flash total 92–95%, all three 68–71%, handwritten 12–25%.

No document benchmark is published for all three models, so the estimate leans on the few overlaps:
- LMArena Vision puts GLM-5.3 Flash (1274) and Gemma 4 31B (1265) within ~10 points: near parity on general vision.
- MMMU-Pro: Gemma 4 76.9 vs DeepSeek V4.1 Flash base 56.5 (different settings; directionally Gemma ahead).
- Gemma 4's OmniDocBench 1.5 edit distance of 0.131 indicates solid page reading for a general model.
- Against it: Gemma is a 31B dense model served at 4-bit (QAT, loss unquantified) with a server default visual budget of 280 tokens; GLM and DeepSeek are 300–550B MoE models answering with reasoning. Handwriting and small digits on poor photos are where scale and resolution matter most.

Expected on our set: printed PDFs and scans close to GLM (total ≥ 90–95%); handwritten between DeepSeek and GLM (roughly 25–50% all three right); overall all-three-right roughly 65–80%. The visual token budget (280 vs 1120) is likely the single biggest lever. Only the run on the gold set settles it.
