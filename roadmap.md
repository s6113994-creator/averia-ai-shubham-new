- [x] Apply monochrome interaction tokens and touch-safe motion rules.
- [x] Add collapsing feed/search treatment to News.
- [x] Refresh chat composer and assistant transcript with AI Elements primitives.
- [x] Compact Trade controls and move content above the fold.
- [x] Rebalance AppShell into recent projects and recent chats zones.
- [x] Implement the uploaded fixed navigation and unified history scroll layout.
- [x] Add the scoped All Projects history page and route.
- [x] Add working Web Speech recognition and optional spoken responses.
- [x] Apply global tactile interactions while preserving existing color tokens.
- [ ] Run typecheck, build, lint, and preview verification for the previous UI work.

## Subscription, payment, admin, and ATS wiring
- [x] Use the already-applied subscription and admin database rules; add no new database changes.
- [ ] Use the shared four-tier catalog and exact plan comparison on the pricing route.
- [ ] Connect the saved merchant UPI ID (`ganeshrajak123451@okhdfcbank`) to QR/deep links and submit validated UTRs as pending requests only.
- [ ] Keep `/admin` and `/admin-vault` restricted to `s6113994@gmail.com`; route payment decisions and tier changes through protected admin RPCs.
- [ ] Show authoritative ATS in the dashboard and trigger the existing one-month Pro reward at 500.
- [ ] Run typecheck and inspect the live preview; verify signed-in payment/admin operations if an authenticated preview session is available.

## Trade email verification and admin routing
- [x] Verify listing email with Cloud Auth OTP, bind verification to the active account, and recover cleanly from expired codes.
- [x] Route both `/admin` and `/admin-vault` to the existing email- and role-restricted Admin Vault with live payment and user-tier data.
- [ ] Run typecheck, tests, and preview checks for these fixes.
