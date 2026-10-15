# Shared black-box scenarios

Give every tool the same app URL, credentials, and the scenario text below. Do not provide source code or the defect oracle in a black-box round. Reset the app between tools and between variants. Keep the browser viewport at 1440 × 900 for desktop runs and 390 × 844 for mobile runs.

## S1 — Sign-in and access control

Sign in as the agent. Verify that Tickets is available. Open `/reports` directly and verify that a non-manager cannot see report data. Sign out. Sign in as the manager and verify that Reports shows the current ticket totals.

## S2 — Create a valid ticket

As the agent, create a ticket titled `Customer cannot update profile photo` for `alex@sample.example`, with a description of at least ten characters, High priority, and due date `2026-10-30`. Verify it appears in the ticket list and its detail page shows the saved values.

## S3 — Reject an invalid customer email

Submit a new ticket with title `Billing page returns an error`, customer email `not-an-email`, and a valid description. Verify that no ticket is created and the user receives a validation error. In the defect variant, the client control and server both permit this invalid input so the behavior is visible through the UI.

## S4 — Search and filter correctly

Filter tickets by status `Open`. Verify that every returned row is Open and that `In Progress` tickets are absent. Search for `invoice` and verify the matching title appears. Clear the filters and confirm the full seeded list returns.

## S5 — Persist a workflow change

Open ticket `T-1001`. Save its status as `Resolved`. Reload the page and verify it is still Resolved. Return to the list and verify the row is Resolved. Verify the ticket activity records the status change.

## S6 — Save separate updates and a comment

Open ticket `T-1002`. Save priority as High, then save status as `Waiting on Customer`. Add the comment `Asked the customer for the failing invoice number.` Reload and verify both field values and the comment. The activity trail should show separate priority, status, and comment events.

## S7 — Keyboard and mobile usability

At desktop size, use keyboard navigation to reach and operate Search tickets, status filter, priority filter, and Apply filters. At 390 × 844, sign in and navigate the ticket list and a ticket detail without losing controls or horizontal page clipping. Check that form controls have accessible names.

## S8 — Evidence and triage

For every failure, record the exact steps, expected result, actual result, ticket ID, browser/device, screenshot or video if supported, and a likely root-cause location. Do not mark a tool as detecting a bug merely because it generated a test; the run must expose the incorrect behavior.
