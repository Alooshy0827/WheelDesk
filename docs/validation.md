# Validation / 验证记录

Version: 0.1.1 internal beta. Host: Apple Silicon, macOS 26.6. Target: macOS 13+ Apple Silicon. Windows installer is deferred by request.

## Automated checks

- `npm run typecheck`: passed.
- `npm run test:helper`: 692 input assertions, 544 context assertions, 26 macOS callback assertions; all passed (1,262 total). The context tests include shortcut validation, held modifiers, target changes and elevated targets.
- `npm test`: 134 files passed; 2,077 tests passed, 5 skipped. Includes original-effect migration, moving effect/function pairs, gesture snapshots, one-shot dispatch, preview isolation, scaled hit testing, capture cleanup, local asset-origin boundaries, upstream regressions, configuration repair, workflow sequencing/failure/cancel/snapshots, actual scripts, provider fixtures and credential boundaries.
- `npm run build`: passed.
- The first full test run, concurrent with the native compiler, hit the upstream PDF test’s 5-second timeout. A full rerun without that contention passed unchanged.

- Prior GitHub Actions: [initial cross-platform check](https://github.com/Alooshy0827/WheelDesk/actions/runs/43441701375) passed on both native platforms.

## Desktop validation

`tools/smoke.cjs` launches the real Electron application against a disposable configuration directory and local mock model server. The settings renderer now directly reuses the upstream settings styles, platform themes, grouped rows, Fluent controls and wheel editor; the new action/workflow/model configuration lives inside that interface.

Checks include settings rendering, Chinese text, section navigation, light/dark themes, effect/function pair editing and persistence, empty function slots, all 12 original effects, All In’s collision/rings/flash, original 1.18× hover scaling and 120 ms transition, custom function labels, independent effect preview, idle overlay cleanup, all 12 WAV files fetched and decoded from the production app origin, model listing, streamed text-only AI responses, usage, rejecting privileged operations from the result renderer, and a real local script action. It does not send data to an external model service.

## macOS installer checks

- DMG generated successfully; `hdiutil verify` passed.
- DMG mounts read-only with WheelDesk.app and the Applications shortcut.
- `codesign --verify --deep --strict` passed for the ad-hoc-signed app.
- Both bundled native helpers are ARM64; app identifier is `app.wheeldesk.desktop`, minimum macOS is 13.0.
- Packaged JavaScript matches the checked production build. LICENSE and NOTICE.md are present; the 15 original textures and 12 WAV sounds are present with attribution; no credentials or node_modules are bundled.
- The 0.1.1 app was copied from the DMG to an isolated installation directory and launched. Its native accessibility tree and screenshot confirm the production wheeldesk://app origin, version, original wheel textures/palette and custom-function bindings.

## Not yet accepted on real systems

- macOS 13 specifically has not been tested; this host runs macOS 26.6.
- Global gestures, normal input passthrough, multi-monitor mixed scaling, selected-text extraction, screen capture, clipboard restoration and target-window fill-back still require hands-on OS acceptance. The hook helper initially reported missing Accessibility access and later started successfully, but a running helper alone is not evidence that these interactions passed.
- Real API credentials, live provider rate limits and model image capability require user-configured services. Automated provider tests use mocks.
- GitHub Actions run 43441701375 passed typecheck, native helper tests, JavaScript tests and production build on both Windows and macOS. Windows desktop interaction, installation/uninstallation and executable delivery remain pending.
- The macOS beta is ad-hoc signed, without Apple notarization. Permission grants may need refreshing after rebuilding.

This is an internal beta, not a claim that every item in the original two-platform acceptance plan has passed.
