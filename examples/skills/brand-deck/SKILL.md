---
name: brand-deck
description: |
  Use when the user asks you to create or update a brand deck, launch deck,
  or brand deck outline from a product brief and brand guidelines. Produce an
  editable PowerPoint file and keep the source used to generate it when the
  user asks for a deck file.

  Do not use for: freeform graphic design, spreadsheet analysis, document
  editing, code bugfixes, or slide requests that do not provide brand or
  audience guidance.
---

# brand-deck

Promise: a product brief and brand guidelines become a concise, editable
PowerPoint launch deck with source that can be reviewed and regenerated.

## Steps

1. Read the brief and brand guidelines before writing files.
2. Plan the deck as five slides: title, customer problem, product story,
   rollout proof, and call to action.
3. Create a deck.js source file using pptxgenjs. Use the brand colors, typography notes,
   and required product language from the guidelines.
4. Run the source file to create a launch-deck.pptx file.
5. Run the provided verifier and iterate until it passes.
6. Explain the created files in 2-3 sentences.

## Boundaries

- Do not edit the brief, brand guidelines, or assets without explicit approval.
- Do not create raster-only slides when an editable PowerPoint can be produced.
- Do not fetch remote images or fonts; use the local assets and text provided.
- Do not claim the deck is visually perfect. The verifier checks concrete
  structure, content, and brand constraints.
