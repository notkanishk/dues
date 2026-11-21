# Marking a region on a document has no keyboard-only path

When the reader did not locate a value, the Claimant can point to it on the document ("Point to it"). On a bill with a text layer, Tab, Shift+Tab and the arrows walk the printed words and Enter takes one. On a bill without one (handwriting, a bad scan) there are no words to walk, so a region is marked by a drag, or by two taps or clicks (one corner, then the opposite). Marking a region from the keyboard alone is not built. Typing the value (`E`) is the keyboard path for a bill with no text layer. This is a known exception to WCAG 2.1.1 (Keyboard, Level A). Two taps or clicks satisfy WCAG 2.5.7 (Dragging Movements). The exception is recorded in `PRODUCT.md`.

## Considered Options

- **Keyboard region marking** (arrow-key cursor, a corner, a second corner): rejected for v1; a fiddly mode for a rare case, when typing the value reaches the same outcome without a box.
- **Drag only**: rejected; fails 2.5.7 and is hard on a phone.
- **No Point to it on bills without a text layer**: rejected; a third of bills have no located total, and the marked place is the evidence the Claimant would otherwise lack.

## Consequences

- A Claimant who cannot use a pointer confirms such a value by typing it. The line then reads "differs from the document" (or "marked by you" when they marked it), and no box is drawn for a value nobody found.
- If the product is ever audited against Level A, this exception is stated, not hidden. Reopen this ADR if a keyboard marking mode is built.
