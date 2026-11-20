# PROTOTYPE, throwaway. Scores out/fields/*.json against gold.json, writes report.md.
# usage: uv run --project py python score.py
import json, re, pathlib, collections, statistics as st

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "out"
gp = ROOT / "gold.json"
if not gp.exists():
    raise SystemExit("gold.json not found yet - nothing to score (out/ results are ready)")
GOLD = {g["id"]: g for g in json.load(open(gp))}
SAMPLE = {s["id"]: s for s in json.load(open(ROOT / "sample.json"))}
MULTI = {"pdf_text-05", "pdf_text-08", "pdf_text-10", "pdf_text-11"}  # several invoices in one file; printed totals sum to ledger
FIELDS = ["total", "date", "bill_no", "gstin", "vendor"]


def norm(s): return re.sub(r"[^a-z0-9]", "", str(s).casefold())
def toks(s): return set(re.findall(r"[a-z0-9]+", str(s).casefold()))


def check(f, pred, g):
    """True/False, or None if not applicable (gold has no value)"""
    p, l = g["printed"], g["ledger"]
    if f == "total":
        gold = p.get("total") if p.get("total") is not None else l.get("amount")
        return pred is not None and gold is not None and abs(pred - gold) <= 1.0
    if f == "date":
        gold = p.get("date") or l.get("date")
        return pred is not None and pred == gold
    if f == "bill_no":
        gold = p.get("bill_no")
        if not gold: return None
        a, b = norm(pred or ""), norm(gold)
        return bool(a) and (a == b or a in b or b in a)
    if f == "gstin":
        gold = p.get("gstin")
        return None if not gold else pred == gold
    if f == "vendor":
        gold = p.get("vendor")
        if not gold: return None
        gt = toks(gold)
        return bool(gt) and len(gt & toks(pred or "")) / len(gt) >= 0.5


def score_pair(fields, ids):
    """-> {field: (right, n), 'all_key': (right, n)}"""
    acc = {f: [0, 0] for f in FIELDS + ["all_key"]}
    for i in ids:
        if i not in fields: continue
        g, pred = GOLD[i], fields[i]
        res = {f: check(f, pred.get(f), g) for f in FIELDS}
        for f, r in res.items():
            if r is not None: acc[f][1] += 1; acc[f][0] += bool(r)
        key = [res[f] for f in ("total", "date", "bill_no") if res[f] is not None]
        acc["all_key"][1] += 1; acc["all_key"][0] += all(key)
    return acc


def pct(a): return f"{100 * a[0] / a[1]:.0f}% ({a[0]}/{a[1]})" if a[1] else "-"


def table(head, rows):
    return "\n".join(["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + ["| " + " | ".join(map(str, r)) + " |" for r in rows]) + "\n"


pairs = {}  # "py__py-text" -> fields
for f in sorted((OUT / "fields").glob("*.json")):
    pairs[f.stem] = json.load(open(f))
meta = {m.stem: json.load(open(m)) for m in (OUT / "meta").glob("*.json")}
native = [p for p in pairs if p.split("__")[0] == p.split("__")[1][:2]]
ids_main = [i for i in SAMPLE if i in GOLD and i not in MULTI]
by_kind = {k: [i for i in ids_main if SAMPLE[i]["kind"] == k] for k in ("pdf_text", "pdf_scan", "image")}
by_doc = collections.defaultdict(list)
for i in ids_main: by_doc[GOLD[i]["doc_type"]].append(i)
by_leg = collections.defaultdict(list)
for i in ids_main: by_leg[GOLD[i]["legibility"]].append(i)

R = [f"<!-- PROTOTYPE, throwaway -->\n# Parsing experiment report\n\n{len(SAMPLE)} files; {len(ids_main)} scored in main tables "
     f"(+{len(MULTI)} multi-invoice files reported separately). Pair = parser__extractor; native = parser in same language as extractor.\n"]

R.append("## 1. Native pipelines, per field (overall, multi-invoice files excluded)\n")
rows = []
for p in native:
    a = score_pair(pairs[p], ids_main)
    rows.append([p] + [pct(a[f]) for f in FIELDS + ["all_key"]])
R.append(table(["pair"] + FIELDS + ["all key (total+date+bill_no)"], rows))

R.append("## 2. Cross-check matrix: all-key rate, rows = extractor, columns = parser\n")
exts = sorted({p.split("__")[1] for p in pairs})
R.append(table(["extractor", "py parser", "ts parser"],
               [[e] + [pct(score_pair(pairs[f"{pr}__{e}"], ids_main)["all_key"]) if f"{pr}__{e}" in pairs else "-" for pr in ("py", "ts")] for e in exts]))
R.append("Same matrix for **total** only:\n")
R.append(table(["extractor", "py parser", "ts parser"],
               [[e] + [pct(score_pair(pairs[f"{pr}__{e}"], ids_main)["total"]) if f"{pr}__{e}" in pairs else "-" for pr in ("py", "ts")] for e in exts]))

R.append("## 3. All-key rate and total rate by kind (native pairs)\n")
rows = []
for p in native:
    row = [p]
    for k, ids in by_kind.items():
        a = score_pair(pairs[p], ids); row.append(f"{pct(a['all_key'])} / tot {pct(a['total'])}")
    rows.append(row)
R.append(table(["pair"] + [f"{k} (n={len(v)})" for k, v in by_kind.items()], rows))

R.append("## 4. All-key rate by gold doc_type and legibility (native pairs)\n")
groups = {**{f"doc:{k}": v for k, v in by_doc.items()}, **{f"leg:{k}": v for k, v in by_leg.items()}}
rows = [[p] + [pct(score_pair(pairs[p], ids)["all_key"]) for ids in groups.values()] for p in native]
R.append(table(["pair"] + [f"{k} (n={len(v)})" for k, v in groups.items()], rows))

R.append("## 5. Multi-invoice files (not counted above)\n")
R.append("Gold stores one printed total per file; parsers return a single total, so these are expected to be wrong unless the file is summed. Shown: parsed total vs gold printed.total.\n")
rows = []
for i in sorted(MULTI):
    if i not in GOLD: continue
    g = GOLD[i]["printed"].get("total")
    rows.append([i, g] + [pairs[p].get(i, {}).get("total") for p in native[:8]])
R.append(table(["id", "gold total"] + native[:8], rows))

R.append("## 6. Runtime, determinism, memory, failures (per extractor)\n")
rows = []
for v, m in sorted(meta.items()):
    if "skipped" in m: rows.append([v, "SKIPPED", "", "", "", m["skipped"][:80]]); continue
    fl = m["files"]
    t = [x["t1"] for x in fl.values()]
    errs = [i for i, x in fl.items() if x.get("error")]
    det = sum(x["identical"] for x in fl.values())
    rows.append([v, f"{st.mean(t):.2f}s", f"{max(t):.1f}s", f"{det}/{len(fl)}", m.get("peak_rss_mb"), f"{len(errs)}: {', '.join(errs[:4])}" + (f" ({fl[errs[0]]['error'][:60]})" if errs else "")])
R.append(table(["extractor", "mean s/file", "max s/file", "identical text on rerun", "peak RSS MB (process)", "errors"], rows))
nondet = [(v, i) for v, m in meta.items() if "files" in m for i, x in m["files"].items() if not x["identical"]]
R.append(f"Non-deterministic (variant, id): {nondet[:20] or 'none'}\n")
R.append("Parser determinism: both parsers are pure functions of the text, so identical text implies identical fields.\n")

R.append("## 7. Failures (native pairs): ids where all-key is wrong\n")
fails = {}
for p in native:
    f = []
    for i in ids_main:
        if i in pairs[p]:
            res = [check(x, pairs[p][i].get(x), GOLD[i]) for x in ("total", "date", "bill_no")]
            if not all(r for r in res if r is not None): f.append(i)
    fails[p] = set(f)
    R.append(f"- **{p}**: {len(f)} fail: {', '.join(f)}\n")
best_any = set(ids_main)
for p in pairs:
    ok = {i for i in ids_main if i in pairs[p] and all(r for r in (check(x, pairs[p][i].get(x), GOLD[i]) for x in ("total", "date", "bill_no")) if r is not None)}
    best_any &= set(ids_main) - ok
R.append(f"\n**Wrong for EVERY pair (all-key)**: {len(best_any)}: " + ", ".join(f"{i} ({GOLD[i]['doc_type']}/{GOLD[i]['legibility']})" for i in sorted(best_any)) + "\n")

# union oracle: best single extractor choice per file (native)
orc = {i for i in ids_main if any(i not in fails[p] and i in pairs[p] for p in native)}
R.append(f"Oracle (per file, best native pair): {len(orc)}/{len(ids_main)} all-key right.\n")

R.append("## Findings\n\n(see FINDINGS block below, filled by hand after reading the tables)\n")
(ROOT / "report.md").write_text("\n".join(R))
print("\n".join(R)[:6000])
