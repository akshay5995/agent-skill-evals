# Brand Deck Example

This example tests a skill that creates an editable PowerPoint launch deck.

The sample project starts with:

- `brief.md`
- `brand-guidelines.md`
- `assets/nimbus-logo.svg`
- `verify_brand_deck.cjs`

The agent should create:

- `deck.js`
- `launch-deck.pptx`

The verifier opens the `.pptx` file and checks clear facts: five slides, required text, brand colors, and editable slide text. It does not judge whether the deck looks beautiful.

```yaml
- description: brand-deck positive (create launch deck)
  vars:
    prompt: Use the launch brief in this folder to create a branded PowerPoint for the Nimbus spring review.
    fixture: ./fixtures/brand-deck
    preconditions:
      - verifier.fails:
          run: ./verify_brand_deck.cjs
    should:
      - verifier.succeeds:
          run: ./verify_brand_deck.cjs
      - file.created:
          path: launch-deck.pptx
      - file.created:
          path: deck.js
      - file.contains:
          path: deck.js
          text: pptxgenjs
    should_not:
      - file.changes_outside_scope:
          scope:
            - deck.js
            - launch-deck.pptx
  assert:
    - type: javascript
      metric: skill.test
      value: file://./agent-skill-evals/assertions.js
      config:
        metric: skill.test
```

This test checks:

- The deck is missing before the agent runs.
- The prompt asks the agent to turn a source document into a presentation.
- The agent creates an editable `.pptx` file.
- The agent creates the source file used to make the deck.
- The deck passes the verifier script.
- Only the allowed files changed.

See the runnable version in `examples/tests/brand-deck.yaml`.
