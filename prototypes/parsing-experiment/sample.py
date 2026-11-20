# PROTOTYPE, throwaway. Stratified random sample of filed invoices (seed fixed).
import csv, json, os, random, subprocess, pathlib
ROOT = pathlib.Path(os.environ.get("FILED_DIR", "Filed"))  # folder of filed claims: Filed/<year>/<Claim>/...
LEDGER = pathlib.Path(__file__).resolve().parents[2] / "private" / "ledger.csv"
batches = {r["batch"] for r in csv.DictReader(open(LEDGER))}
def kind(p):
    if p.suffix.lower() in (".jpg", ".jpeg"): return "image"
    t = subprocess.run(["pdftotext", "-l", "2", str(p), "-"], capture_output=True, text=True).stdout
    return "pdf_text" if len("".join(t.split())) >= 50 else "pdf_scan"
files = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in (".pdf", ".jpg", ".jpeg")
         and "form" not in p.name.lower()]
groups = {}
for p in files:
    batch = str(p.parent.relative_to(ROOT))
    if batch not in batches: continue
    groups.setdefault(kind(p), []).append({"file": str(p), "batch": batch})
random.seed(42)
want = {"pdf_text": 18, "pdf_scan": 10, "image": 14}
sample = []
for k, n in want.items():
    for i, item in enumerate(random.sample(groups[k], min(n, len(groups[k])))):
        sample.append({"id": f"{k}-{i+1:02d}", "kind": k, **item})
json.dump(sample, open("sample.json", "w"), indent=1)
print({k: len(v) for k, v in groups.items()}, "sampled", len(sample))
