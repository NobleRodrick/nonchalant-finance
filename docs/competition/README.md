# 2026 FinTechathon (International Track, Topic E: SME Finance Copilot)

Submission documents for Springer Finance, generated on 12 October 2026.

| File | Checklist item |
|---|---|
| `1-Technical-Documentation.pdf` | 01 Technical documentation (architecture, core algorithms, security design) |
| `2-Pitch-Deck.pdf` | 02 Presentation deck (14 slides, ~10 minutes) |
| `3-Security-Self-Assessment.pdf` | 05 Security self-assessment (permission tiers, known-risk list) |
| `4-Agent-Execution-Evidence.pdf` | 06 Execution evidence (sandbox operation logs) |
| `evidence/` | Raw audit trail of the sandbox run (`copilot_events.jsonl`, proposals, results) |

Source code (04) is this repository. Reproduce the sandbox run: see section 3 of the execution evidence,
or `npm run sandbox:build` then `node dist-sandbox/copilot-sandbox.mjs seed|run|export` with a disposable
`DATABASE_URL`, `PRISMA_DRIVER_ADAPTER=pg` and `GEMINI_API_KEY`.
