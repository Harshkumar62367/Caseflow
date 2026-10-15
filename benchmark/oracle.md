# Operator-only defect oracle

Do not provide this file to an AI tool during a black-box test round. Use one `BENCHMARK_VARIANT` per run, with a fresh server and reset data.

| Variant | Deliberate defect | Expected detection |
| --- | --- | --- |
| `baseline` | None | All shared scenarios should pass. Findings here are potential false positives or real implementation defects to investigate. |
| `validation` | The new-ticket form and API accept an invalid customer email. | S3 should fail: an invalid ticket is created through the UI. |
| `authorization` | An agent can fetch manager report data from `/api/report`. | S1 should fail on direct access. The UI still hides the Reports navigation for agents. |
| `filter` | The `Open` filter includes `In Progress` tickets. | S4 should find false-positive rows. |
| `workflow` | Saving `Resolved` returns success but does not persist the status. | S5 should fail after reload and the activity event is absent. |
| `a11y` | The ticket search input loses its label and placeholder, leaving no accessible name. | S7 should report the unnamed search control. |

The variants are controlled mutations in the target app. They are not defects discovered in SolidX or any other testing platform. Use detection of these mutations to compare test generation and execution quality. A tool may have a feature outside the scope of these mutations; record that separately in the scorecard.
