# Local VLM document extraction: facts (as of 2026-11-20)

Scope: facts only, no recommendation. Every fact has a URL. Items marked UNCONFIRMED could not be checked against a primary source. Items marked ESTIMATE are my arithmetic, not a source claim. Items marked OPINION are not first-party.

Hardware context: 1x RTX 6000 Ada, 48 GB VRAM. Gemma 4 31B QAT w4a16 is already served on :8000 with vLLM 0.33.0; qwen-asr on :8080. Free VRAM for a second model is therefore small (see the fit table).

---

## 1. Gemma 4 31B (and QAT w4a16)

| Fact | Value | Source |
|---|---|---|
| Parameters | 31B metadata (30.7B in the dense table), dense, not MoE | https://huggingface.co/google/gemma-4-31B-it |
| Architecture | 60 layers, 1024-token sliding window, 256K context, 262K vocab, hybrid local/global attention | https://huggingface.co/google/gemma-4-31B-it |
| Modalities | Text and image in, text out. No audio on the 31B | https://huggingface.co/google/gemma-4-31B-it |
| Vision encoder | About 550M parameters. Encoder architecture not described | https://huggingface.co/google/gemma-4-31B-it |
| Image resolution | Variable aspect ratio and resolution. No maximum pixel size stated | https://huggingface.co/google/gemma-4-31B-it |
| Visual token budget | Configurable: 70, 140, 280, 560, 1120. Higher budgets recommended for OCR and document parsing | https://huggingface.co/google/gemma-4-31B-it |
| Tiling | Not mentioned | https://huggingface.co/google/gemma-4-31B-it |
| How to set the token budget in vLLM | Not stated on the model card (UNCONFIRMED how to set it in vLLM 0.33.0) | https://huggingface.co/google/gemma-4-31B-it |
| License | Apache 2.0 | https://huggingface.co/google/gemma-4-31B-it |
| QAT w4a16 | Quantization-aware training, compressed-tensors format, "for native, optimized inference with vLLM". No file size or VRAM figure on the card | https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct |
| QAT w4a16 metadata | Shown as 33B params (I32 + BF16 tensors) | https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct |
| vLLM serve command | `vllm serve "google/gemma-4-31B-it"`; image sent as `image_url` content part in `/v1/chat/completions` | https://huggingface.co/google/gemma-4-31B-it |
| vLLM minimum version for Gemma 4 | Not stated (UNCONFIRMED). The card says only to use the latest Transformers | https://huggingface.co/google/gemma-4-31B-it |
| Document benchmarks reported by Google | OmniDocBench 1.5 average edit distance **0.131** (lower is better). MMMU Pro 76.9%, MATH-Vision 85.6%, MedXPertQA MM 61.3%. **No DocVQA, ChartQA or OCRBench numbers on the card** | https://huggingface.co/google/gemma-4-31B-it |
| Document parsing (third-party eval on HF) | ParseBench (llamaindex) mean 62.4; Text Content 89.9; Text Formatting 69.3 (pipeline gemma4_31b_vllm_with_layout) | https://huggingface.co/google/gemma-4-31B-it |
| Other numbers | MMLU Pro 85.2, GPQA Diamond 84.3, MMMLU 88.4 | https://huggingface.co/google/gemma-4-31B-it |
| Hindi / Devanagari | Card says "out-of-the-box support for 35+ languages" and pre-training on 140+. Hindi not named. Only multilingual benchmark is MMMLU 88.4 | https://huggingface.co/google/gemma-4-31B-it |
| Handwriting | Not mentioned (UNCONFIRMED) | https://huggingface.co/google/gemma-4-31B-it |
| Gemma 3 invoice/receipt data (predecessor, zero-shot) | gemma-3-12b-it: SROIE 66.91%, Donut clean invoices 84.66%, inv-cdip scanned invoices 82.09%. gemma-3-4b-it: 53.79 / 45.69 / 76.02. Gemma 4 not tested in this paper | https://arxiv.org/html/2509.04469v1 |

Gemma 4 vs Gemma 3 on invoice data is not measured in any source found.

---

## 2. Hardware fit table

Weights are estimates from parameter count and precision (bytes per param: BF16 = 2, FP8 = 1, 4-bit = about 0.5 plus overhead). KV cache and activations are excluded. "Fits beside Gemma" means free VRAM after Gemma at its current footprint (ESTIMATE: Gemma w4a16 weights about 17 to 20 GB, so about 25 to 28 GB is free before KV cache and qwen-asr). Confirm with `nvidia-smi` on the host.

| Model | Params (card) | Quant | Weights VRAM | Fits beside Gemma 4? | Source |
|---|---|---|---|---|---|
| Gemma 4 31B QAT w4a16 | 31B dense (33B metadata) | w4a16 QAT | ESTIMATE about 17 to 20 GB | Already running | https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct |
| Gemma 4 31B BF16 | 31B | BF16 | ESTIMATE about 62 GB | No | https://huggingface.co/google/gemma-4-31B-it |
| Qwen3-VL-8B-Instruct | 8B (9B metadata), Apache 2.0 | BF16 | ESTIMATE about 18 GB | Only if Gemma KV cache is small. Tight | https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct |
| Qwen3-VL-8B-Instruct | as above | FP8 | No FP8 variant named on card | UNCONFIRMED | https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct |
| Qwen3-VL-30B-A3B-Instruct (MoE) | 31B total, about 3B active (active count inferred from name) | BF16 | ESTIMATE about 62 GB | No at BF16. FP8/4-bit not checked | https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct |
| Qwen3-VL-32B-Instruct | 33B metadata, Apache 2.0 | BF16 | ESTIMATE about 66 GB | No | https://huggingface.co/Qwen/Qwen3-VL-32B-Instruct |
| Qwen2.5-VL-72B-Instruct-AWQ | 74B metadata, 4-bit AWQ | AWQ | ESTIMATE about 40 GB+ | No | https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct-AWQ |
| InternVL3.5-8B | 8.5B (9B metadata), Apache 2.0 | BF16 | ESTIMATE about 18 GB | Tight, as Qwen3-VL-8B | https://huggingface.co/OpenGVLab/InternVL3_5-8B |
| InternVL3.5-38B | 38.4B, Apache 2.0 | BF16 | ESTIMATE about 77 GB. Card says "requires two A100 GPUs" | No. Quant variants not named | https://huggingface.co/OpenGVLab/InternVL3_5-38B |
| MiniCPM-V 4.5 | 8B (8.7B in inference table), Apache 2.0. Quantized (GGUF, int4, AWQ) variants exist | BF16 | ESTIMATE about 17 GB. Card gives 28G GPU memory only for Video-MME on 8xA100, not a general figure | Tight as above. Quant VRAM not published | https://huggingface.co/openbmb/MiniCPM-V-4_5 |
| Mistral Small 3.2 24B | 24B, Apache 2.0, image input yes | BF16 | Card says about 55 GB in bf16/fp16 | No at BF16. Quantized sizes not on card | https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506 |
| olmOCR-2-7B-1025 | 8B metadata (Qwen2.5-VL-7B base), Apache 2.0. FP8 variant also published, recommended for practical use | BF16 | ESTIMATE about 16 GB. FP8 about 8 GB | BF16 tight, FP8 fits | https://huggingface.co/allenai/olmOCR-2-7B-1025 |
| Nanonets-OCR2-3B | 4B metadata, base Qwen2.5-VL-3B, license not stated on card | BF16 | ESTIMATE about 8 GB | Yes | https://huggingface.co/nanonets/Nanonets-OCR2-3B |
| dots.ocr | 3B, MIT | BF16 | ESTIMATE about 6 to 7 GB | Yes | https://huggingface.co/rednote-hilab/dots.ocr |
| PaddleOCR-VL | 0.9B (1.0B metadata), Apache 2.0 | BF16 | ESTIMATE about 2 GB | Yes | https://huggingface.co/PaddlePaddle/PaddleOCR-VL |
| MinerU2.5 | 1.2B, AGPL-3.0 | BF16 | ESTIMATE about 3 GB | Yes | https://huggingface.co/opendatalab/MinerU2.5-2509-1.2B |
| DeepSeek-OCR | 3B, MIT | BF16 | ESTIMATE about 7 GB | Yes | https://huggingface.co/deepseek-ai/DeepSeek-OCR |
| granite-docling-258M | 0.3B metadata, Apache 2.0 | BF16 | ESTIMATE about 1 GB | Yes | https://huggingface.co/ibm-granite/granite-docling-258M |
| Xiaomi-OCR-0 | 0.8B headline, 0.9B metadata, Apache 2.0 | BF16 | ESTIMATE about 2 GB | Yes | https://huggingface.co/xiaomi-research/Xiaomi-OCR-0 |
| Unlimited-OCR | 3B, MIT | BF16 | ESTIMATE about 6 to 7 GB | Yes | https://huggingface.co/baidu/Unlimited-OCR |
| Llama 4 Scout | Not checked | n/a | UNCONFIRMED (not researched in this pass) | UNCONFIRMED | n/a |
| Phi-4-multimodal | Not checked | n/a | UNCONFIRMED (not researched in this pass) | UNCONFIRMED | n/a |

Note: the user's list names MiniCPM-V, Phi-4-multimodal and Llama 4 Scout. Only MiniCPM-V 4.5 was fetched. Phi-4-multimodal and Llama 4 Scout were not checked.

---

## 3. Benchmark table

Values are as printed on the cited pages. "Self-reported" means reported by the model's own authors. Versions differ: OmniDocBench v1.0, v1.5 and v1.6 are not directly comparable.

| Model | DocVQA | OCRBench / OCRBench v2 | OmniDocBench | Other document / OCR | Source |
|---|---|---|---|---|---|
| Gemma 4 31B | not reported | not reported | 1.5 edit distance **0.131** (lower better) | ParseBench mean 62.4 (third-party eval) | https://huggingface.co/google/gemma-4-31B-it |
| Qwen3-VL-235B-A22B (flagship, paper) | 96.5 | 875 | not in text | not checked | https://arxiv.org/pdf/2511.21631 and https://the-decoder.com/qwen3-vl-can-scan-two-hour-videos-and-pinpoint-nearly-every-detail/ (press coverage of the paper) |
| Qwen3-VL-8B | not on card | "leading" claim, no number | MDPBench overall 68.3 (digital 78.4, photographed 65) | ParseBench mean 46.8 | https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct |
| Qwen3-VL-32B | not on card | not on card | not on card | LongShot-Bench 40.59 (video, not OCR) | https://huggingface.co/Qwen/Qwen3-VL-32B-Instruct |
| Qwen3-VL-30B-A3B | not on card | not on card | not on card | LongShot-Bench 30.81 (not OCR) | https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct |
| Qwen2.5-VL-72B-AWQ | 96.1 (BF16), 96.0 (AWQ) | not on card | not on card | MMMU 70.0 / 69.1 (BF16 / AWQ) | https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct-AWQ |
| InternVL3.5-8B | not on card | not on card | not on card | MDPBench 42.7 (digital 59.7, photo 37); ExtractBench mean 64.63 | https://huggingface.co/OpenGVLab/InternVL3_5-8B |
| InternVL3.5-38B | not on card | not on card | not on card | none in text | https://huggingface.co/OpenGVLab/InternVL3_5-38B |
| MiniCPM-V 4.5 | not on card | "leading" claim, no number | "state-of-the-art among general MLLMs", no number | none | https://huggingface.co/openbmb/MiniCPM-V-4_5 |
| Mistral Small 3.2 24B | 94.86 | none | none | none | https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506 |
| olmOCR-2-7B-1025 | none | none | none | olmOCR-Bench 82.3 +/- 1.1 (FP8 82.4) (self-reported, pipeline v0.4.0) | https://huggingface.co/allenai/olmOCR-2-7B-1025 |
| dots.ocr | none | none | EN 0.125 / ZH 0.160 overall edit (end-to-end, lower better); table TEDS 88.6 / 89.0 | olmOCR-bench 79.1 +/- 1.0 | https://huggingface.co/rednote-hilab/dots.ocr |
| PaddleOCR-VL (v1.0 paper) | none | none | overall edit **0.115** (lowest in that paper's table) | olmOCR-bench 80.0 +/- 1.0 (paper's own table) | https://arxiv.org/pdf/2510.14528 and https://arxiv.org/pdf/2510.14528v4 |
| PaddleOCR-VL 1.6 | none | none | 96.33 on v1.6 (Baidu claim) | none | https://huggingface.co/PaddlePaddle/PaddleOCR-VL (version named in card); 96.33 is from OPINION source below |
| Nanonets-OCR2-3B | DocVQA **89.43**, ChartQA 78.56 | none | MDPBench overall 64.2 | olmOCR-bench 69.5 | https://huggingface.co/nanonets/Nanonets-OCR2-3B |
| Nanonets OCR-s (v1 paper) | none | none | 0.289 (v1.0, edit) | none | https://arxiv.org/pdf/2510.14528 |
| MinerU2.5 | none | none | not extractable from card (chart only) | olmOCR-bench 75.2; MDPBench 46.3 | https://huggingface.co/opendatalab/MinerU2.5-2509-1.2B |
| DeepSeek-OCR | none | none | not on card | olmOCR-bench 75.7; MDPBench 51.8 | https://huggingface.co/deepseek-ai/DeepSeek-OCR |
| granite-docling-258M | none | OCRBench **500** (SmolDocling 338) | none | MMStar 0.30; table TEDS 0.97 (structure) | https://huggingface.co/ibm-granite/granite-docling-258M |
| Xiaomi-OCR-0 | DocVQA 93.1 (in OCR-VQA mean of 5) | OCRBench 84.6 (in the same mean) | OmniDocBench v1.6 overall **96.83** (rank #2 per card); Real5 95.24 | UniMER-Test 97.84; PubTabNet 92.27; InfoVQA 75.1; ChartQA 84.6 | https://huggingface.co/xiaomi-research/Xiaomi-OCR-0 |
| Unlimited-OCR | none | none | none | ParseBench mean 46.17 | https://huggingface.co/baidu/Unlimited-OCR |
| Qwen2.5-VL-72B (report, from paper context) | 96.4 | 885 | n/a | n/a | https://arxiv.org/pdf/2502.13923 (numbers as quoted by search summary, UNCONFIRMED against the PDF) |

Notes:
- Gemma 4 has no DocVQA / OCRBench figure on its card. That is a gap for direct comparison.
- Xiaomi-OCR-0 is the only model in this set with DocVQA and OmniDocBench v1.6 on its card in the same table. Its figures are self-reported.

### 3b. Invoice / receipt / handwriting benchmarks

| Benchmark | What it is | Reported results | Source |
|---|---|---|---|
| SROIE (ICDAR 2019 Scanned Receipt OCR and IE) | 1000 whole scanned receipt images; tasks: text localisation, OCR, key info extraction | Arxiv page gives no entity metric, no train/test split. Gemma-3-12b zero-shot 66.91% accuracy on the receipt set (Berghaus et al., paper's own dataset name "Scanned Receipts (ICDAR-2019-SROIE)"). Closed models 53.92 to 87.46 | https://arxiv.org/abs/2103.10213 ; https://arxiv.org/html/2509.04469v1 |
| CORD | Consolidated receipt dataset, Indonesian receipts, box/text plus parse labels. Train 800 / dev 100 / test 100 per the repo table. Repo also says "over 11,000" in one place (conflict noted on the page) | No VLM result in this pass | https://github.com/clovaai/cord |
| Donut "clean invoices" set (used in Berghaus et al.) | Clean invoices | Gemma-3-12b 84.66%; gemini-2.5-pro 96.50%; gpt-5-nano 86.45% lowest closed | https://arxiv.org/html/2509.04469v1 |
| inv-cdip "scanned invoices" (used in Berghaus et al.) | Scanned invoices | Gemma-3-12b 82.09%; gemini-2.5-pro 92.71%; gpt-5-nano 80.61% | https://arxiv.org/html/2509.04469v1 |
| Handwriting benchmark | Chronicles-OCR "Mature Scripts" (historical handwriting, not invoices), reported by Xiaomi-OCR-0 | 73 | https://huggingface.co/xiaomi-research/Xiaomi-OCR-0 |
| Indian invoices / GST invoices / UPI screenshots / Hindi handwritten bills | No public benchmark found in this pass | none | UNCONFIRMED (no source located) |

The Berghaus et al. paper states that its three datasets are openly available, uses zero-shot prompting, and reports only overall accuracy (no F1). The paper does not report Gemma 4 results.

---

## 4. vLLM features

| Feature | Fact | Source |
|---|---|---|
| JSON-schema structured outputs, OpenAI-style | `response_format` with `{"type": "json_schema", "json_schema": {"name": ..., "schema": ...}}` in `client.chat.completions.create()`. Pydantic: `client.beta.chat.completions.parse` with `message.parsed` | https://docs.vllm.ai/en/latest/features/structured_outputs.html |
| vLLM-native structured outputs | `extra_body={"structured_outputs": {"json": ...}}`; offline `StructuredOutputsParams(json=...)` | https://docs.vllm.ai/en/latest/features/structured_outputs/ |
| Removed fields | `guided_json` and `guided_regex` removed in v0.12.0 | https://docs.vllm.ai/en/v0.26.0/features/structured_outputs/ |
| Whether `response_format` and `structured_outputs` can be combined | Not stated (UNCONFIRMED) | https://docs.vllm.ai/en/latest/features/structured_outputs/ |
| Backend selection | `--structured-outputs-config.backend`; default `auto`; `xgrammar` and `guidance` named; `lm-format-enforcer` deprecated from v0.33.0 | https://docs.vllm.ai/en/latest/features/structured_outputs/ |
| Reasoning models | `--structured-outputs-config.enable_in_reasoning=True` needed when combining with reasoning (v0.20.2 docs). Not relevant to Gemma 4 unless it emits reasoning (UNCONFIRMED for Gemma 4) | https://docs.vllm.ai/en/v0.20.2/features/structured_outputs/ |
| Multimodal per-prompt limit | `--limit-mm-per-prompt` takes JSON, e.g. `{"image": 16}`; also per-modality options (`count`, `width`, `height`, `num_frames`). Default `{}`; docs text says default 999 per modality. Mistral example uses `--limit-mm-per-prompt '{"image":10}'` | https://docs.vllm.ai/en/latest/configuration/engine_args/ ; https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506 |
| GPU memory fraction | `--gpu-memory-utilization` (default and exact text not extracted, UNCONFIRMED default). dots.ocr card example uses 0.95 | https://huggingface.co/rednote-hilab/dots.ocr (example value); docs flag exists per engine_args page |
| Max model length | `--max-model-len`, accepts `k`/`m`/`g` suffixes; `auto` picks largest that fits | https://docs.vllm.ai/en/latest/configuration/engine_args/ |
| Image pixel limits | No dedicated min/max pixel flag found. `--mm-processor-kwargs` forwards processor args, keys are model-specific (example `num_crops` for Phi-3-Vision). Gemma 4 pixel/token knobs in vLLM: UNCONFIRMED | https://docs.vllm.ai/en/latest/configuration/engine_args/ |
| Several models on one GPU | Docs do not describe a multi-model single instance in the page checked. One vLLM process per model is the documented path (UNCONFIRMED that this is the only mode). Run two servers with a lower `--gpu-memory-utilization` each | https://docs.vllm.ai/en/latest/configuration/engine_args/ |
| LoRA | `--enable-lora`; `--max-loras` (default 1) is the max LoRAs per batch | https://docs.vllm.ai/en/latest/configuration/engine_args/ |
| Served-model name | `--served-model-name`, defaults to `--model` value | https://docs.vllm.ai/en/latest/configuration/engine_args/ |
| Gemma 4 on vLLM 0.33.0 | Not stated on the card. The user's running server is evidence it loads (UNCONFIRMED exact minimum version) | https://huggingface.co/google/gemma-4-31B-it |

---

## 5. Specialised OCR / document models

| Model | Params, licence | Output | OmniDocBench / other | Handwriting | vLLM | Source |
|---|---|---|---|---|---|---|
| olmOCR-2-7B-1025 | 8B metadata, Apache 2.0, FP8 variant | YAML front matter + text (page-level) | olmOCR-bench 82.3 (BF16) / 82.4 (FP8) | Not mentioned | `vllm serve`; render page longest side 1288 px | https://huggingface.co/allenai/olmOCR-2-7B-1025 |
| dots.ocr | 3B, MIT | JSON layout (bbox, category, text) + Markdown, LaTeX, HTML tables | OmniDocBench end-to-end EN 0.125 / ZH 0.160; olmOCR-bench 79.1 | Not mentioned | Card says vLLM is "highly recommended"; model must be registered with vLLM first (sed patch of the vLLM entry point), needs `--trust-remote-code`, model directory name must not contain dots; authors tested on vLLM 0.9.1. Upstream-support status not stated on this card (UNCONFIRMED) | https://huggingface.co/rednote-hilab/dots.ocr |
| PaddleOCR-VL | 0.9B (1.0B metadata), Apache 2.0 | JSON and Markdown | v1.0 overall edit 0.115 (paper); v1.6 96.33 (Baidu claim) | Yes (card says suited to handwritten text and historical documents) | vLLM support announced 2025-11-04; paddlepaddle-gpu 3.2.1 required | https://huggingface.co/PaddlePaddle/PaddleOCR-VL ; https://arxiv.org/pdf/2510.14528 |
| Nanonets-OCR2-3B | 4B metadata, base Qwen2.5-VL-3B, licence not stated | Markdown with semantic tags: HTML tables, LaTeX equations, `<img>`, `<signature>`, `<watermark>`, checkboxes, mermaid for charts. No JSON | DocVQA 89.43, ChartQA 78.56, olmOCR-bench 69.5, MDPBench 64.2 | Trained on handwritten docs; no accuracy figure | `vllm serve nanonets/Nanonets-OCR2-3B` | https://huggingface.co/nanonets/Nanonets-OCR2-3B |
| GOT-OCR 2.0 | Not fetched | n/a | n/a | n/a | UNCONFIRMED (not researched in this pass) | n/a |
| MinerU 2.5 (MinerU2.5-2509-1.2B) | 1.2B, AGPL-3.0 | Markdown, JSON per the MinerU pipeline (card: vLLM backend, `mineru-vl-utils[vllm]`) | not extractable; olmOCR-bench 75.2 | Not mentioned | Recommended backend: `vllm-engine` / `vllm-async-engine`; no version given | https://huggingface.co/opendatalab/MinerU2.5-2509-1.2B |
| DeepSeek-OCR | 3B, MIT | Markdown (prompt-driven); "Free OCR." prompt | olmOCR-bench 75.7; MDPBench 51.8; OmniDocBench not on card | Not mentioned | Upstream since 2025/10/23 per card; nightly install needed before v0.11.1 | https://huggingface.co/deepseek-ai/DeepSeek-OCR |
| granite-docling-258M | 0.3B metadata, Apache 2.0 | DocTags, converted to Markdown/HTML by Docling | OCRBench 500 | Not mentioned | Needs `--revision untied`; float32 on T4-class GPUs | https://huggingface.co/ibm-granite/granite-docling-258M |
| SmolDocling | Not fetched separately; compared in the granite card | DocTags | OCRBench 338 (in granite card comparison) | n/a | n/a | https://huggingface.co/ibm-granite/granite-docling-258M |
| Xiaomi-OCR-0 (released 2026-09-30) | 0.8B headline, 0.9B metadata, Apache 2.0 | Markdown (tables in OTSL, formulas in LaTeX) for whole page; JSON for KIE | OmniDocBench v1.6 96.83 (rank #2 per card) | Card: Chronicles-OCR handwriting 73 | vLLM supported per card | https://huggingface.co/xiaomi-research/Xiaomi-OCR-0 |
| Unlimited-OCR (2026-06-22) | 3B, MIT | Markdown; parser files | ParseBench mean 46.17 | Not mentioned | vLLM supported (2026/06/28 update); Docker `vllm/vllm-openai:unlimited-ocr` | https://huggingface.co/baidu/Unlimited-OCR |
| TeleOCR (2026-08-17) | About 1.2B per search summary | Not checked | Not checked | Not checked | UNCONFIRMED | https://huggingface.co/XingChen-AGI/TeleOCR |
| MiniCPM-V 4.5 | 8B, Apache 2.0 | Not OCR-specific | "state-of-the-art PDF parsing among general MLLMs" (no number) | Demos only | vLLM supported from v0.10.2; llama.cpp; AWQ / int4 / GGUF | https://huggingface.co/openbmb/MiniCPM-V-4_5 |

---

## 6. Opinions and non-first-party sources (labelled)

- **OPINION (vendor-biased):** LlamaIndex blog dated 2026-11-19 ranks LlamaParse first. Its table gives ParseBench-2 overall: LlamaParse Agentic Plus 89.8, Claude Opus 5.5 85.7, Gemini 4 84.2, GPT-5.6 77.1, MinerU2.5 Pro 75.6, PaddleOCR-VL 1.6 70.3, Qwen3.8-27B 61.6. olmOCR 2, DeepSeek-OCR 2 and dots.mocr are listed without scores. The post states its benchmark is its own (ParseBench-2, published 2026-11-12, 44 configurations, 4.3k cases). The author advises testing 50 of your own pages. Source: https://www.llamaindex.ai/insights/best-vision-language-models
- **OPINION (not first-party, unreviewed):** A practitioner post reports an OCR-then-small-LM pipeline at 99.1% vs Gemini 2.5 Flash at 95.2% on 93 real EU invoices. Small private set, not reproduced. Source: https://cy.linkedin.com/in/christoph-schillmeier
- **OPINION (vendor marketing):** Webkul says vision-based models are best for invoices. No benchmark shown. Source: https://webkul.com/blog/invoice-data-extraction-ocr-ai/
- **Peer-reviewed-style evidence (arXiv, not first-party to any model):** Berghaus et al. (arXiv 2509.04469) found the native image path for Gemma 3 vs Docling+LLM parse. For Gemma-3-12b: scanned receipts native 66.91% vs structured parsing 41.48; clean invoices native 84.66% vs 84.91; scanned invoices native 82.09% vs 61.21. Docling and SmolDocling gave near-identical parse results. Source: https://arxiv.org/html/2509.04469v1
- **Second paper (arXiv 2510.15727):** LLM-based extractor (LlamaExtractor) beat a Docling OCR+layout method on invoices; authors suggest a hybrid. Source: https://arxiv.org/pdf/2510.15727 (numeric tables not read in this pass)

Reading the evidence: Berghaus et al. show native VLM beats OCR-first on two of three invoice-like sets for Gemma 3, and loses on clean invoices where OCR is already easy. The result is for Gemma 3, not Gemma 4, and for zero-shot overall accuracy only.

---

## 7. UNCONFIRMED / not checked

- Gemma 4 31B: DocVQA, ChartQA, OCRBench numbers (not on card). Hindi/Devanagari OCR quality. Handwriting. Maximum image pixel size and tiling. How to set the visual token budget in vLLM 0.33.0. Exact vLLM minimum version.
- Gemma 4 QAT w4a16 VRAM at runtime. Only the card's 33B metadata was read.
- Qwen3-VL-30B-A3B and -32B: OCR numbers (not on card). FP8/AWQ variants (not named on cards).
- Qwen3-VL-8B FP8 variant: not named.
- InternVL3.5 OCR/document numbers: values are images on the cards, not extractable.
- MiniCPM-V 4.5: numeric OCR scores not on card. Quant VRAM not published.
- Llama 4 Scout (quantised fit), Phi-4-multimodal, GOT-OCR 2.0, SmolDocling as a separate card, TeleOCR details: not researched.
- Indian invoices, GST invoices, UPI screenshots, Hindi handwritten bills: no public benchmark found.
- vLLM: whether `response_format` and `structured_outputs` can be combined. Exact default for `--gpu-memory-utilization`. Multi-model single-process serving (only one-process-per-model path seen).
- olmOCR-2 Hindi and handwriting support: not stated.
- Nanonets-OCR2 licence: not stated on card.
- dots.ocr "officially supported upstream" status: card wording unclear (the card names an upstream date for DeepSeek-OCR, not dots.ocr).
- CORD dataset size: repo states both "over 11,000" and 1,000 total images. Table counts used (800/100/100).

---

## 8. Sources list (URLs in order of first use)

- https://huggingface.co/google/gemma-4-31B-it
- https://huggingface.co/google/gemma-4-31B-it-qat-w4a16-ct
- https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct
- https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct
- https://huggingface.co/Qwen/Qwen3-VL-32B-Instruct
- https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct-AWQ
- https://huggingface.co/OpenGVLab/InternVL3_5-8B
- https://huggingface.co/OpenGVLab/InternVL3_5-38B
- https://huggingface.co/openbmb/MiniCPM-V-4_5
- https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506
- https://huggingface.co/allenai/olmOCR-2-7B-1025
- https://huggingface.co/rednote-hilab/dots.ocr
- https://huggingface.co/PaddlePaddle/PaddleOCR-VL
- https://huggingface.co/nanonets/Nanonets-OCR2-3B
- https://huggingface.co/opendatalab/MinerU2.5-2509-1.2B
- https://huggingface.co/deepseek-ai/DeepSeek-OCR
- https://huggingface.co/ibm-granite/granite-docling-258M
- https://huggingface.co/xiaomi-research/Xiaomi-OCR-0
- https://huggingface.co/baidu/Unlimited-OCR
- https://huggingface.co/XingChen-AGI/TeleOCR
- https://arxiv.org/pdf/2511.21631 (Qwen3-VL technical report)
- https://arxiv.org/pdf/2510.14528 (PaddleOCR-VL paper)
- https://arxiv.org/pdf/2502.13923 (Qwen2.5-VL report)
- https://arxiv.org/abs/2103.10213 (ICDAR 2019 SROIE)
- https://github.com/clovaai/cord
- https://arxiv.org/html/2509.04469v1 (Berghaus et al.)
- https://arxiv.org/pdf/2510.15727
- https://docs.vllm.ai/en/latest/features/structured_outputs/
- https://docs.vllm.ai/en/latest/configuration/engine_args/
- https://docs.vllm.ai/en/v0.26.0/features/structured_outputs/
- https://docs.vllm.ai/en/v0.20.2/features/structured_outputs/
- https://www.llamaindex.ai/insights/best-vision-language-models
- https://cy.linkedin.com/in/christoph-schillmeier
- https://webkul.com/blog/invoice-data-extraction-ocr-ai/
