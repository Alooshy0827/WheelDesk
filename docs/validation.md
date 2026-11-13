# Validation / 验证记录

Version: 0.1.0 internal beta. Host: Apple Silicon, macOS 26.6. Target: macOS 13+ Apple Silicon. Windows installer is deferred by request.

## Automated checks

- `npm run typecheck`: passed.
- `npm run test:helper`: 692 input assertions, 544 context assertions, 26 macOS callback assertions; all passed (1,262 total). The context tests include shortcut validation, held modifiers, target changes and elevated targets.
- `npm test`: 132 files passed; 2,061 tests passed, 5 skipped. Includes upstream regressions, configuration repair, workflow sequencing/failure/cancel/snapshots, actual scripts, provider fixtures and credential boundaries.
- `npm run build`: passed.

## Desktop validation

`tools/smoke.cjs` launches the real Electron application against a disposable configuration directory and local mock model server. The settings renderer now directly reuses the upstream settings styles, platform themes, grouped rows, Fluent controls and wheel editor; the new action/workflow/model configuration lives inside that interface.

Checks include settings rendering, Chinese text, section navigation, light/dark themes, wheel slot editing and persistence, model listing, streamed text-only AI responses, usage, rejecting privileged operations from the result renderer, and a real local script action. It does not send data to an external model service.

## Not yet accepted on real systems

- macOS 13 specifically has not been tested; this host runs macOS 26.6.
- Global gestures, normal input passthrough, multi-monitor mixed scaling, selected-text extraction, screen capture, clipboard restoration and target-window fill-back still require hands-on OS acceptance. The hook helper initially reported missing Accessibility access and later started successfully, but a running helper alone is not evidence that these interactions passed.
- Real API credentials, live provider rate limits and model image capability require user-configured services. Automated provider tests use mocks.
- Windows compilation/interaction, installation/uninstallation and executable delivery are pending. A native Windows CI/build workflow is included.
- The macOS beta is ad-hoc signed, without Apple notarization. Permission grants may need refreshing after rebuilding.

This is an internal beta, not a claim that every item in the original two-platform acceptance plan has passed.
