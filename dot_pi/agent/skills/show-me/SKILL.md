---
name: show-me
description: Explain a topic with compact diagrams, code sketches, or self-contained local HTML.
disable-model-invocation: true
---

# Show the shape
Read [visual guidance](references/show-me.md).

1. Resolve the topic from the request or conversation. Ask if it is unclear. Resolve a task directory only when saving an artifact is requested. Inspect relevant evidence before drawing; distinguish observed behavior from proposals.
2. Choose the smallest visual that answers the question: pseudocode for logic, call trees for control flow, component/file trees for ownership, tables for comparisons, Mermaid for relationships, or focused diffs for changes.
3. Show the visual directly in the chat response; use fenced `mermaid` blocks for inline diagrams. Keep related steps and useful detail together, aiming for readability rather than the narrowest possible diagram. Save a short `NN-visual-topic.md` explanation only when the user requests a saved artifact.
   - Before drawing Mermaid, call `ui_size` if available (discover tools through codemode tool search if needed). Prefer observed assistant Markdown width; widget layout width still needs room for message padding.
   - Before posting, call `mermaid_check` with the complete raw source. Leave some breathing room within the available width. If preflight fails, revise labels, messages, or layout while preserving the explanation and check again, up to three attempts. Split only when needed. If it still fails, use a simpler visual or explain the limitation rather than posting a known failing diagram.
   - If tools, renderer, or dimensions are unavailable, proceed with a moderately compact layout without claiming a verified fit. Preflight predicts rendering, not screen output: resizing, settings, or other transformers can change the result. If actual rendering differs, ask for screen feedback and recheck the current width.
4. For layouts or richer comparisons that need HTML, offer a self-contained HTML artifact; save it in the task directory and link to it only when requested. Follow the product's design system when relevant, use realistic but non-sensitive labels, and support narrow screens and light/dark preferences. Plain text or inline SVG works offline; remote renderers and CDN scripts are not required.
5. Provide the local file path (and file URI if useful). Do not claim the terminal rendered or opened HTML. Offer an OS-appropriate open command; run it only when requested. Save HTML beside the Markdown that references it.

## Handoff
For an inline explanation, finish with the visual and brief supporting text. For requested saved artifacts, provide their paths and any relevant limitations; no workflow handoff is required.
