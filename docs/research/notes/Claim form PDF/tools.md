# Claim form PDF: tools research

Researched 2026-11-21. Goal: fill a .docx form template (table rows, totals, amount in words) and convert it to a PDF that looks like Word's own output, on a Docker-capable LXC (4 GB RAM, 6 cores), with no cloud service receiving data.

Conventions: "unverified" marks a claim I could not confirm from a primary page in this pass. Release dates come from GitHub/PyPI/Docker/vendor pages fetched on the date above. Nothing here hit a paywall or key request; I did not run any tool.

## 1. Converters (docx to PDF)

| Tool | Engine | Self-host, Docker image | RAM | Licence / price | Account or key for trial | Last release seen | Bindings |
|---|---|---|---|---|---|---|---|
| LibreOffice headless | Own (Writer) | Package `libreoffice-writer` | No figure published | MPL-2.0 [1] | None | n/a | CLI, UNO (Python, Java) |
| unoserver | LibreOffice (UNO listener) | PyPI `unoserver`; no official image [2] | No figure; keeps LO loaded, 1 instance per port for parallelism [2] | MIT [3] | None | 3.7, 2026-06-10 [3] | Python CLI/lib |
| Gotenberg | LibreOffice (Debian trixie-backports) + Chromium [4][5] | `gotenberg/gotenberg:9`, `:9-libreoffice`, `:9-chromium` [6] | Docs: min 512Mi on K8s; demo runs on 512 MB [6] | MIT [7] | None | v9.9.1, 2026-11-20 [8] | HTTP API (any language) |
| Collabora Online (CODE) | LibreOffice core | `collabora/code` [9] | No figure | Not stated on pages read; CODE "not recommended for production" [10] | None for CODE; paid for supported builds [10] | Helm chart 1.3.8, 2026-11-07 [11] (app tag not checked) | HTTP `POST /cool/convert-to/pdf` [12] |
| ONLYOFFICE Docs (Document Server) | Own (core engine) | `onlyoffice/documentserver` [13] | Docker guide: 4 GB or more, dual core, 40 GB disk [14] | AGPL-3.0 (Community); Enterprise/Developer commercial; ~20 user recommendation [13] | None for Community | v10.0.0, 2026-10-12 [15] | HTTP `POST /converter` [16] |
| ONLYOFFICE Document Builder | Own (same core) | pip `document-builder`; no Docker mentioned [17] | Not stated | AGPL-3.0, dual-licensed, commercial via sales [17] | None | No release listed on repo page [17] | JS, Python, C++, .NET, COM [17] |
| Aspose.Words for Python via .NET | Own | pip `aspose-words`; Linux supported [18][19] | Not stated | Commercial; from US$1,199 Developer Small Business [20] | Trial: no key, evaluation watermark plus a few-hundred-paragraph cap; 30-day temporary licence on request [21] | 26.11.0, 2026-11-17 [18] | Python, .NET, Java, C++ and others (other bindings not checked) |
| Apryse (PDFTron) Office conversion | Own, "no external dependencies" [22][23] | SDK download, no image found | Not stated | Commercial; "from $1,500" is a general entry price, not an Office quote [24] | Trial key by contacting Apryse (a no-tracking key is available on request); watermark without key; Office Conversion Package must be in the key [23][24] | Summer 2026 release [24] | Python, C++, Java, .NET, others |
| Nutrient (PSPDFKit) Document Engine | Not confirmed for DOCX (search hints at GdPicture) [25] | `pspdfkit/document-engine` (seen in docs example) [25] | Not stated | Commercial; activation key `3-...` (online) or offline key; dev key online only [26] | Yes, key from Nutrient; container needs outbound portal access unless offline key [26] | Changelog exists, date not checked | HTTP API |
| Syncfusion DocIO | Own, uses fonts installed on host [27] | NuGet; `syncfusion/document-processing-apis` image [27] | Not stated | Commercial; free Community Licence if under US$1M revenue, 5 devs, 10 staff, under US$3M outside capital [28] | Syncfusion account and licence key; trial watermark on PDF [27][28] | Not checked | .NET |
| GemBox.Document | Own | NuGet; no image | Not stated | Free mode: 20-paragraph cap (counts table cells, per a competitor, unverified) [29]; paid US$890 single dev, royalty-free [30] | None for free mode | Not checked | .NET |
| docx4j (+ docx4j-export-fo) | Apache FOP via XSL-FO, own layout, not Word's [31][32] | Maven; no image | Not stated | Apache-2.0 [33] | None | 17.3.6, 2026-11-08 [31] | Java; Python and TypeScript packages announced Sep 2026 [31] |
| Carbone (template plus convert) | LibreOffice, or own "ICE", Chrome, OnlyOffice (v5+) [34][35] | `carbone/carbone-ee` (tags `slim` has no PDF, `full`, `full-fonts`) [36] | Not stated | Community free under Carbone Code License (source-available, no competing hosted service) [35]; Fit EUR 1,500/yr; Unlimited from EUR 2,940/yr [37] | None for Community; 30-day trial for Enterprise via `CARBONE_LICENSE` [36][37] | npm edition is one major behind (v4 vs v5+) [35] | Node SDK, REST |
| Microsoft Graph conversion | Word Online | Cloud only: EXCLUDED [38] | n/a | M365 | n/a | n/a | n/a |
| docx2pdf | Microsoft Word (must be installed) | Windows/macOS only: not usable on Linux [39] | n/a | MIT | n/a | 0.1.8, 2021-12 [39] | Python |
| Pandoc | Not a Word layout engine; docx is read as a document model, PDF via LaTeX, WeasyPrint, Typst etc. [40] | n/a | n/a | GPL-2.0+ [41] | None | n/a | CLI |

Fidelity notes (what the sources actually say):
- LibreOffice-based paths (unoserver, Gotenberg, Collabora, Carbone-LO): layout depends on installed fonts; a missing font is substituted and shifts page breaks [5][42]. No primary source gives a quantified "fidelity vs Word" for tables; this needs a hands-on test.
- docx4j says its FOP output has fidelity limits and page breaks can land differently; its own blog says high fidelity on arbitrary files needs Microsoft's layout engine [32].
- Apryse, Aspose, Syncfusion, GemBox claim Word-faithful conversion with their own engines; those are vendor claims. I found no independent benchmark.
- ONLYOFFICE and Carbone ICE use their own engines, so their output may differ from LibreOffice either way; test both.

## 2. Template fillers

| Tool | What it does | Licence | Latest | Notes |
|---|---|---|---|---|
| docxtpl (python-docx-template) | Jinja2 inside a .docx; `{%tr for %}` repeats table rows; RichText, subdocs, images [43] | LGPL-2.1 | 0.20.2, 2025-11-13 [44] | Uses python-docx under the hood. Tags must sit in a single run [43]. |
| python-docx | Create/edit docx in code; weak at editing templates (per docxtpl) [43] | MIT | 1.2.0, 2025-06-16 [45] | Needed for manual row cloning and styling. |
| docxtemplater (JS) | Tag replace, loops, conditions in core; 19 paid modules (Image, Html, Table, Chart...) [46] | MIT core (page also says "MIT or GPLv3") [46] | 3.71.1 [47] | Docs show row loops with plain loop tags in cells, no module named [48]; module pricing 500 to 9000 EUR/yr [46]. |
| docx-templates (JS) | Template from Word with JS expressions | MIT [49] | 4.15.0, 2025-12-03 [50] | Table row loops not verified here. |
| easy-template-x (JS) | Tag-based docx templating | MIT [49] | 8.1.1 (npm) [51] | Row-loop behaviour not verified here. |
| Carbone | Template with `{d.x}` tags, loops, formatters; also converts [35] | CCL (community) | see above | Amount-in-words style formatters exist in Enterprise or community: not verified. |
| docx4j | Variable replace, JAXB model, content-control data binding [33] | Apache-2.0 | 17.3.6 [31] | Java only. |
| Aspose Mail Merge / Reporting Engine | Merge fields, `TableStart:Name`/`TableEnd:Name` regions grow with rows [52] | Commercial | with Aspose.Words | In Python, use `execute_with_regions` with `IMailMergeDataSource` [52]. |
| Word MERGEFIELD | Word's native mail merge | Needs Word desktop to run; not verified from a primary page (support page 404) | n/a | Not usable headless. Aspose can read MERGEFIELDs [52]. |

Amount in words: none of these provides it as a built-in. Compute it in app code (Python `num2words`, not checked here) and pass it as a plain string. Totals likewise: compute in app, never use Word fields.

## 3. Not using .docx: HTML/CSS (or Typst) to PDF

| Tool | Notes |
|---|---|
| Chromium (Puppeteer / Gotenberg Chromium route) | Puppeteer core 25.18.1, 2026-11-17 [53]. Gotenberg exposes Chromium as `gotenberg/gotenberg:9-chromium` [6]. Uses installed system fonts. |
| WeasyPrint | BSD, v70.0, Python >= 3.10, needs Pango >= 1.44, fonts from system via fontconfig [54][55]. Lightest option: no browser. |
| Typst | CLI uses system fonts plus `--font-path`; embedded fonts do not include Arial [56]; v0.15.1, 2026-07-17 [57]. |

When this is the standard choice: when you own the layout (invoices, receipts, reports generated from data) and nobody needs to edit the file in Word. You get exact, deterministic layout with page-break control (CSS paged media), and no Word fidelity gap, because there is no Word to match. It is NOT a drop-in when the issuing body supplies the official .docx and expects its exact look: you re-create the form, and any later change to their template means redoing it by hand. Judgement based on the vendor docs above, not a quoted source.

## 4. Font fidelity

- **Arial**: Liberation Sans has the same metrics (Debian `fonts-liberation` 1:2.1.5-3 in trixie) [58]; licence SIL OFL 1.1 for 2.x [59]. Fontconfig maps Arimo and Liberation Sans to Arial by default [60].
- **Arial Narrow**: `fonts-liberation-sans-narrow` (Debian trixie, 1:1.07.6-4) is "intended to replace Arial Narrow" [61]; Wikipedia states it is metrically compatible with Arial Narrow [62]. Fontconfig aliases Arial Narrow to Liberation Sans Narrow [60]. Caveats:
  - Liberation 2.x dropped Narrow "due to licensing problems"; 2.x repo points to old releases (1.07.x) [63].
  - 1.x licence: GPL with font-embedding exception [62]. Check that this is acceptable for a public repo and a Docker image.
  - Gotenberg's base image installs `fonts-liberation`, `fonts-liberation2`, Carlito, Caladea, DejaVu, Noto, URW base35 and no Narrow package [64]. So Arial Narrow will fall back unless you add `fonts-liberation-sans-narrow` in a derived image.
- **Microsoft core fonts**: Debian `ttf-mscorefonts-installer` is in `contrib` and downloads at install time [65]. Its sourceforge page lists the fonts only loosely [66]. I could not confirm from a primary source that Arial Narrow is absent from the core-fonts set; to my knowledge it is (it ships with Office), so treat as unverified.
- **Licence**: Microsoft's FAQ says Windows-supplied fonts may not be copied to other computers or servers, and web self-hosting is not allowed [67]. Embedding in documents/PDFs by apps that obey the embedding flags is allowed [67]. Practical reading: do not bake Arial/Arial Narrow into the public repo or image; the safe route is metric-compatible substitutes. A PDF made by Word with embedded fonts is allowed; one made on your server with the substitute fonts is a different font, only the same width.
- **Gotenberg**: since 8.30.0 Arial, Times New Roman and Calibri map to metric-compatible substitutes by default; fonts live in the image, not per request [5] (from a search summary; the docs page itself returned 404, so confirm).
- **Word-vs-LO layout drift** after font substitution is usually small with metric-compatible fonts but can change glyph shape, hinting and kerning: expect a visual diff, not a layout diff. Verify with a pixel diff.

## 5. Shortlist to test hands-on (self-hosted, no account or key)

1. LibreOffice via Gotenberg: `gotenberg/gotenberg:9-libreoffice` (MIT) plus derived image adding `fonts-liberation-sans-narrow`. Pin an exact tag.
2. unoserver: PyPI `unoserver` (MIT) + apt `libreoffice-writer`; run as a sidecar with `--conversion-timeout` and `--stop-after` [2]. Lower overhead than Gotenberg if you want a tiny image.
3. ONLYOFFICE Document Server: `onlyoffice/documentserver` (AGPL-3.0). Own engine; heavier (4 GB guidance), so worth one comparison run, not production.
4. Carbone Community: `carbone/carbone-ee` tag `full-fonts` (no key for community features). Test whether the own "ICE" converter works without a licence: not confirmed.
5. Fillers: `docxtpl` + `python-docx` (Python) or `docxtemplater` core (JS).
6. Control: same form in HTML/CSS via WeasyPrint (pip `weasyprint`) or Gotenberg `9-chromium`.

Needs account, key, or contact: Apryse (trial key from Apryse), Nutrient Document Engine (`3-` activation key; online check), Syncfusion DocIO (account plus licence key), Carbone Enterprise (30-day `CARBONE_LICENSE`). Aspose and GemBox run without a key but add a watermark or cap, so cannot be judged on full-document output. Excluded: Microsoft Graph (cloud), docx2pdf (needs Word). Collabora CODE (`collabora/code`) needs no key, but treat as a weak candidate: "not recommended for production" [10]; its connection limits are unclear [search result].

## 6. Recommendation

Fill the template in Python with `docxtpl` (row loops via `{%tr %}`, totals and amount in words computed in app code), then convert with LibreOffice through Gotenberg (`gotenberg/gotenberg:9-libreoffice`, pinned) behind the app on the same host, so no data leaves the box. Build a derived image that adds `fonts-liberation-sans-narrow`, because the stock image has no Arial Narrow substitute, and keep Microsoft's own Arial files out of the repo and image [64][67]. Before committing, render one real filled form through LibreOffice and ONLYOFFICE and compare against a Word-made PDF pixel by pixel; the sources give no quantified Word-fidelity figure for any tool, and LibreOffice is the baseline to beat. If LibreOffice's table or page-break drift is visible, fall back to rebuilding the form in HTML/CSS with WeasyPrint, which gives deterministic output at the price of re-creating the university's layout by hand. Commercial engines (Aspose, Apryse, Syncfusion, GemBox) are not worth the cost and licence friction for one form unless the test shows LibreOffice cannot match.

## Sources

1. https://www.libreoffice.org/about-us/licenses/
2. https://github.com/unoconv/unoserver
3. https://pypi.org/pypi/unoserver/json
4. https://raw.githubusercontent.com/gotenberg/gotenberg/main/build/Dockerfile
5. https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf (via search summary; direct fetch returned empty)
6. https://gotenberg.dev/docs/getting-started/installation
7. https://github.com/gotenberg/gotenberg
8. https://api.github.com/repos/gotenberg/gotenberg/releases/latest
9. https://hub.docker.com/r/collabora/code
10. https://www.collaboraonline.com/code/
11. https://api.github.com/repos/CollaboraOnline/online/releases?per_page=3
12. https://www.collaboraonline.com/document-conversion/
13. https://github.com/ONLYOFFICE/DocumentServer
14. https://helpcenter.onlyoffice.com/installation/docs-community-sys-reqs-docker.aspx (via search summary)
15. https://api.github.com/repos/ONLYOFFICE/DocumentServer/releases?per_page=3
16. https://api.onlyoffice.com/docs/docs-api/additional-api/conversion-api/
17. https://github.com/ONLYOFFICE/DocumentBuilder
18. https://pypi.org/pypi/aspose-words/json
19. https://products.aspose.com/words/python-net/
20. https://purchase.aspose.com/pricing/words/python-net
21. https://docs.aspose.com/words/python-net/licensing/
22. https://docs.apryse.com/core/guides/features/office/
23. https://docs.apryse.com/samples/py/OfficeToPDFTest (via search summary)
24. https://apryse.com/en-ca/pricing and https://docs.apryse.com/support/faq/initialize/watermark (via search summary)
25. https://www.nutrient.io/guides/document-engine/changelog.md and https://www.nutrient.io/guides/document-engine/example-projects (via search summary)
26. https://www.nutrient.io/guides/document-engine/deployment/product-activation/
27. https://help.syncfusion.com/document-processing/word/conversions/word-to-pdf/net/word-to-pdf-linux-docker and https://hub.docker.com/r/syncfusion/document-processing-apis (via search summary)
28. https://www.syncfusion.com/products/communitylicense
29. https://www.gemboxsoftware.com/document/free-version (via search summary)
30. https://www.gemboxsoftware.com/document/pricing
31. https://www.docx4java.org/trac/docx4j
32. https://www.docx4java.org/blog/2020/03/documents4j-for-pdf-output/ (via search summary)
33. https://github.com/plutext/docx4j
34. https://carbone.io/pricing.html
35. https://github.com/carboneio/carbone
36. https://carbone.io/documentation/developer/self-hosted-deployment/deploy-with-docker.html
37. https://carbone.io/pricing.html
38. https://learn.microsoft.com/en-us/graph/api/driveitem-get-content-format (2 MB limit, OneDrive/SharePoint)
39. https://pypi.org/pypi/docx2pdf/json
40. https://pandoc.org/MANUAL.html
41. https://github.com/jgm/pandoc
42. https://gotenberg.dev/docs/troubleshooting (via search summary)
43. https://docxtpl.readthedocs.io/en/latest/
44. https://pypi.org/pypi/docxtpl/json
45. https://pypi.org/pypi/python-docx/json
46. https://docxtemplater.com/pricing/
47. https://registry.npmjs.org/docxtemplater/latest
48. https://docxtemplater.com/docs/tag-types/
49. https://registry.npmjs.org/docx-templates and https://registry.npmjs.org/easy-template-x
50. https://api.github.com/repos/guigrpa/docx-templates/releases/latest
51. https://registry.npmjs.org/easy-template-x (date not visible)
52. https://docs.aspose.com/words/python-net/mail-merge-and-reporting/
53. https://api.github.com/repos/puppeteer/puppeteer/releases/latest
54. https://pypi.org/pypi/weasyprint/json
55. https://doc.courtbouillon.org/weasyprint/stable/first_steps.html
56. https://typst.app/docs/reference/text/text/
57. https://api.github.com/repos/typst/typst/releases/latest
58. https://packages.debian.org/trixie/fonts-liberation
59. https://github.com/liberationfonts/liberation-fonts
60. https://sources.debian.org/data/main/f/fontconfig/2.15.0-2.3/conf.d/30-metric-aliases.conf
61. https://packages.debian.org/trixie/fonts-liberation-sans-narrow
62. https://en.wikipedia.org/wiki/Liberation_fonts
63. https://github.com/liberationfonts/liberation-sans-narrow
64. https://raw.githubusercontent.com/gotenberg/gotenberg/main/build/Dockerfile
65. https://packages.debian.org/trixie/ttf-mscorefonts-installer
66. https://corefonts.sourceforge.net/
67. https://learn.microsoft.com/en-us/typography/fonts/font-faq
