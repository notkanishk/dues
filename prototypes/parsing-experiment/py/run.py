# PROTOTYPE, throwaway. Python extractors + parsing driver. See ../README.md.
# usage: uv run python run.py [--variant V] [--parse-only]
import sys, os, json, time, hashlib, subprocess, resource, signal, logging, pathlib
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "out"
SAMPLE = json.load(open(ROOT / "sample.json"))
VARIANTS = ["py-text", "py-rapidocr", "py-rapidocr-ocronly", "py-docling"]
MAXPAGES = 4
DPI = 200
DOCLING_TIMEOUT = 600
logging.disable(logging.CRITICAL)


def pdf_pages_text(path):
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    out = []
    for i in range(min(len(pdf), MAXPAGES)):
        out.append(pdf[i].get_textpage().get_text_range().replace("\r\n", "\n"))
    return "\n\n".join(out)


def page_images(item):
    """list of RGB numpy arrays (PDF pages rendered, or the image with EXIF orientation applied)"""
    if item["kind"] == "image":
        from PIL import Image, ImageOps
        return [np.array(ImageOps.exif_transpose(Image.open(item["file"])).convert("RGB"))]
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(item["file"])
    return [np.array(pdf[i].render(scale=DPI / 72).to_pil().convert("RGB")) for i in range(min(len(pdf), MAXPAGES))]


_ocr = None


def ocr_text(img):
    global _ocr
    if _ocr is None:
        from rapidocr import RapidOCR
        _ocr = RapidOCR()
    r = _ocr(img)
    if r.txts is None or len(r.txts) == 0:
        return ""
    # merge boxes into lines: sort by y-centre, group when y-centre within half a box height
    items = []
    for b, t in zip(r.boxes, r.txts):
        ys = [p[1] for p in b]; xs = [p[0] for p in b]
        items.append(((min(ys) + max(ys)) / 2, max(ys) - min(ys), min(xs), t))
    items.sort()
    lines, cur, cy, ch = [], [], None, None
    for yc, h, x, t in items:
        if cur and abs(yc - cy) <= 0.5 * max(h, ch):
            cur.append((x, t))
        else:
            if cur: lines.append(cur)
            cur, cy, ch = [(x, t)], yc, h
    if cur: lines.append(cur)
    return "\n".join(" ".join(t for _, t in sorted(l)) for l in lines)


def ocr_item(item):
    return "\n\n".join(ocr_text(im) for im in page_images(item))


_dl = None


class Timeout(Exception): pass


def docling_text(item):
    global _dl
    if _dl is None:
        from docling.document_converter import DocumentConverter
        _dl = DocumentConverter()
    def h(*a): raise Timeout(f"docling > {DOCLING_TIMEOUT}s")
    signal.signal(signal.SIGALRM, h); signal.alarm(DOCLING_TIMEOUT)
    try:
        return _dl.convert(item["file"], max_num_pages=MAXPAGES).document.export_to_markdown()
    finally:
        signal.alarm(0)


def extract(variant, item):
    pdf = item["file"].lower().endswith(".pdf")
    if variant == "py-text":
        return pdf_pages_text(item["file"]) if pdf else ""
    if variant == "py-rapidocr":
        return pdf_pages_text(item["file"]) if item["kind"] == "pdf_text" else ocr_item(item)
    if variant == "py-rapidocr-ocronly":
        return ocr_item(item)
    if variant == "py-docling":
        return docling_text(item)
    raise ValueError(variant)


def worker(variant):
    d = OUT / "text" / variant
    d.mkdir(parents=True, exist_ok=True)
    meta = {"variant": variant, "files": {}}
    errs = 0
    for run in (1, 2):
        for it in SAMPLE:
            m = meta["files"].setdefault(it["id"], {})
            t0 = time.perf_counter()
            try:
                txt = extract(variant, it)
                err = None
            except BaseException as e:  # record and move on
                txt, err = "", f"{type(e).__name__}: {e}"[:300]
            dt = time.perf_counter() - t0
            m[f"t{run}"] = round(dt, 3)
            m[f"sha{run}"] = hashlib.sha1(txt.encode()).hexdigest()[:12]
            if err: m["error"] = err; errs += 1
            if run == 1: (d / f"{it['id']}.txt").write_text(txt)
            print(variant, run, it["id"], f"{dt:.1f}s", err or "", flush=True)
    for m in meta["files"].values():
        m["identical"] = m["sha1"] == m["sha2"]
    meta["peak_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 1)  # macOS: bytes
    (OUT / "meta").mkdir(parents=True, exist_ok=True)
    json.dump(meta, open(OUT / "meta" / f"{variant}.json", "w"), indent=1)


def parse_all():
    from parse import parse
    (OUT / "fields").mkdir(parents=True, exist_ok=True)
    for d in sorted((OUT / "text").iterdir()):
        res = {it["id"]: parse((d / f"{it['id']}.txt").read_text()) for it in SAMPLE if (d / f"{it['id']}.txt").exists()}
        json.dump(res, open(OUT / "fields" / f"py__{d.name}.json", "w"), indent=1, ensure_ascii=False)
        print("parsed py__" + d.name)


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--variant" in a:
        worker(a[a.index("--variant") + 1])
    else:
        if "--parse-only" not in a:
            for v in VARIANTS:
                try:
                    subprocess.run([sys.executable, __file__, "--variant", v], check=True,
                                   timeout=3 * 3600)
                except Exception as e:
                    print("VARIANT FAILED", v, e)
                    (OUT / "meta").mkdir(parents=True, exist_ok=True)
                    json.dump({"variant": v, "skipped": str(e)}, open(OUT / "meta" / f"{v}.json", "w"))
        parse_all()
