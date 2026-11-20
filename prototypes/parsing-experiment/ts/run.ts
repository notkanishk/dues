// PROTOTYPE, throwaway. TS extractors + parsing driver. See ../README.md.
// usage: bun run run.ts [--variant V] [--parse-only]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "./parse";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "out");
const SAMPLE: { id: string; kind: string; file: string }[] = JSON.parse(readFileSync(join(ROOT, "sample.json"), "utf8"));
const VARIANTS = ["ts-text", "ts-tesseract", "ts-tesseract-hin", "ts-paddle"];
const MAXPAGES = 4, DPI = 200;

const isPdf = (f: string) => f.toLowerCase().endsWith(".pdf");

async function pdfText(file: string): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(file)));
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).slice(0, MAXPAGES).join("\n\n");
}

// PDF -> PNG pages via pdftoppm (temp dir); image -> itself
async function withPages<T>(it: { file: string }, fn: (paths: string[]) => Promise<T>): Promise<T> {
  if (!isPdf(it.file)) return fn([it.file]);
  const dir = mkdtempSync(join(tmpdir(), "pe-"));
  try {
    const p = Bun.spawnSync(["pdftoppm", "-r", String(DPI), "-f", "1", "-l", String(MAXPAGES), "-png", it.file, join(dir, "p")]);
    if (p.exitCode !== 0) throw new Error("pdftoppm failed");
    const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => join(dir, f));
    return await fn(files);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const workers: Record<string, any> = {};
async function tess(lang: string, paths: string[]) {
  if (!workers[lang]) {
    const { createWorker } = await import("tesseract.js");
    workers[lang] = await createWorker(lang, 1, { logger: () => {} });
  }
  const out: string[] = [];
  for (const p of paths) out.push((await workers[lang].recognize(p)).data.text);
  return out.join("\n\n");
}

let paddle: any;
async function pad(paths: string[]) {
  paddle ??= await (await import("@gutenye/ocr-node")).default.create();
  const out: string[] = [];
  for (const p of paths) out.push((await paddle.detect(p)).texts.map((t: any) => t.text).join("\n"));
  return out.join("\n\n");
}

async function extract(v: string, it: { kind: string; file: string }): Promise<string> {
  if (v === "ts-text") return isPdf(it.file) ? pdfText(it.file) : "";
  if (v === "ts-tesseract") return withPages(it, (p) => tess("eng", p));
  if (v === "ts-tesseract-hin") return withPages(it, (p) => tess("eng+hin", p));
  if (v === "ts-paddle") return withPages(it, pad);
  throw new Error(v);
}

async function worker(v: string) {
  mkdirSync(join(OUT, "text", v), { recursive: true });
  mkdirSync(join(OUT, "meta"), { recursive: true });
  const files: Record<string, any> = {};
  for (const run of [1, 2]) {
    for (const it of SAMPLE) {
      const m = (files[it.id] ??= {});
      const t0 = performance.now();
      let txt = "", err = "";
      try { txt = await extract(v, it); } catch (e: any) { err = `${e?.name}: ${e?.message}`.slice(0, 300); }
      const dt = (performance.now() - t0) / 1000;
      m[`t${run}`] = Math.round(dt * 1000) / 1000;
      m[`sha${run}`] = createHash("sha1").update(txt).digest("hex").slice(0, 12);
      if (err) m.error = err;
      if (run === 1) writeFileSync(join(OUT, "text", v, `${it.id}.txt`), txt);
      console.log(v, run, it.id, `${dt.toFixed(1)}s`, err);
    }
  }
  for (const m of Object.values(files)) m.identical = m.sha1 === m.sha2;
  const peak = Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10; // KB -> MB
  writeFileSync(join(OUT, "meta", `${v}.json`), JSON.stringify({ variant: v, files, peak_rss_mb: peak }, null, 1));
  for (const w of Object.values(workers)) await w.terminate();
}

function parseAll() {
  mkdirSync(join(OUT, "fields"), { recursive: true });
  for (const d of readdirSync(join(OUT, "text")).sort()) {
    const res: Record<string, any> = {};
    for (const it of SAMPLE) {
      const f = join(OUT, "text", d, `${it.id}.txt`);
      if (existsSync(f)) res[it.id] = parse(readFileSync(f, "utf8"));
    }
    writeFileSync(join(OUT, "fields", `ts__${d}.json`), JSON.stringify(res, null, 1));
    console.log("parsed ts__" + d);
  }
}

const a = process.argv.slice(2);
if (a.includes("--variant")) {
  await worker(a[a.indexOf("--variant") + 1]);
} else {
  if (!a.includes("--parse-only")) {
    for (const v of VARIANTS) {
      const p = Bun.spawnSync(["bun", "run", import.meta.path, "--variant", v], { stdout: "inherit", stderr: "inherit" });
      if (p.exitCode !== 0) {
        mkdirSync(join(OUT, "meta"), { recursive: true });
        writeFileSync(join(OUT, "meta", `${v}.json`), JSON.stringify({ variant: v, skipped: `worker exit ${p.exitCode}` }));
      }
    }
  }
  parseAll();
}
