---
name: show-me
description: Explain a topic with compact diagrams, code sketches, or self-contained local HTML.
disable-model-invocation: true
---

# Show the shape
Read [visual guidance](references/show-me.md).

1. Resolve the topic from the request or conversation. Ask if it is unclear. Resolve a task directory when saving an artifact: an HTML artifact, or Markdown the user asked to save. Inspect relevant evidence before drawing; distinguish observed behavior from proposals.
2. Choose the smallest visual that answers the question: pseudocode for logic, call trees for control flow, component/file trees for ownership, tables for comparisons, Mermaid for relationships, or focused diffs for changes.
3. Show the visual directly in the chat response; use fenced `mermaid` blocks for inline diagrams. Keep related steps and useful detail together, aiming for readability rather than the narrowest possible diagram. Save a short `NN-visual-topic.md` explanation only when the user requests a saved artifact.
   - Before drawing Mermaid, call `ui_size` if available (discover tools through codemode tool search if needed). Prefer observed assistant Markdown width; widget layout width still needs room for message padding.
   - Before posting, call `mermaid_check` with the complete raw source. Leave some breathing room within the available width. If preflight fails, revise labels, messages, or layout while preserving the explanation and check again, up to three attempts. Split only when needed. If it still fails, use a simpler visual or explain the limitation rather than posting a known failing diagram.
   - If tools, renderer, or dimensions are unavailable, proceed with a moderately compact layout without claiming a verified fit. Preflight predicts rendering, not screen output: resizing, settings, or other transformers can change the result. If actual rendering differs, ask for screen feedback and recheck the current width.
4. For layouts or richer comparisons that need HTML, make a self-contained HTML artifact without asking first; save it in the task directory (or, with none, a new directory from `mktemp -d`) and link to it. Follow the product's design system when relevant, use realistic but non-sensitive labels, and support narrow screens and light/dark preferences. Plain text or inline SVG works offline; remote renderers and CDN scripts are not required.
5. Link saved HTML by its absolute `file://` URL, as the visual guidance says, never a relative path. Do not claim the terminal rendered or opened HTML. Offer an OS-appropriate open command; run it only when requested. Save HTML beside the Markdown that references it.

## Handoff
For an inline explanation, finish with the visual and brief supporting text. For saved artifacts, link each by its absolute `file://` URL and note any relevant limitations; no workflow handoff is required.
