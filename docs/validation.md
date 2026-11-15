# Validation / 验证记录

Version: 0.1.6 internal beta. Host: Apple Silicon, macOS 26.6. Target: macOS 13+ Apple Silicon. Windows installer is deferred by request.

## Automated checks

- `npm run typecheck`: passed.
- `npm run test:helper`: 692 input assertions, 544 context assertions, 26 macOS callback assertions; all passed (1,262 total). The context tests include shortcut validation, held modifiers, target changes and elevated targets.
- `npm test`: 136 files passed; 2,145 tests passed, 5 skipped. Includes automatic permission recovery after a grant, suppressing retry loops, failed probes and shutdown during a probe; provider preset persistence, credential clearing on endpoint changes, fixed text-only probes for both protocols, invalid configuration, authentication/rate/model/network/timeout/empty-response errors, plus every spoke count from 2 through 12, odd/even angular boundaries, rendered hit alignment at three scales, per-gesture count snapshots, hidden binding persistence/restoration, original-effect migration, moving effect/function pairs, preserving every binding when resetting replaced effects, gesture snapshots, one-shot dispatch, preview isolation, scaled hit testing, capture cleanup, local asset-origin boundaries, upstream regressions, configuration repair, workflow sequencing/failure/cancel/snapshots, actual scripts, provider fixtures and credential boundaries.
- `npm run build`: passed.

- Prior GitHub Actions: [initial cross-platform check](https://github.com/Alooshy0827/WheelDesk/actions/runs/43441701375) passed on both native platforms.

## Desktop validation

`tools/smoke.cjs` launches the real Electron application against a disposable configuration directory and local mock model server. The settings renderer now directly reuses the upstream settings styles, platform themes, grouped rows, Fluent controls and wheel editor; the new action/workflow/model configuration lives inside that interface.

Checks include eight vendor presets through the real dropdown and persistence after reload, typed test credentials saved after a successful test using a disposable mock keychain, failed replacement preserving the previous key, advanced fields inert and collapsed by default, clear format names and local-key guidance, a successful model-response test, a localized 401 failure without leaked provider text, separate model listing, settings-only test IPC, plus choosing every 2–12 spoke count through the actual settings controls, saving/reloading a smaller count, restoring the twelfth binding after expansion, independent counts on different wheels, rendered overlay alignment at every count, settings rendering, Chinese text, section navigation, light/dark themes, effect/function pair editing and persistence, empty function slots, all 12 original effects, All In’s collision/rings/flash, original 1.18× hover scaling and 120 ms transition, custom function labels, independent effect preview, idle overlay cleanup, all 12 WAV files fetched and decoded from the production app origin, model listing, streamed text-only AI responses, usage, rejecting privileged operations from the result renderer, and a real local script action. It does not send data to an external model service.

## macOS installer checks

- DMG generated successfully; `hdiutil verify` passed.
- DMG mounts read-only with WheelDesk.app and the Applications shortcut.
- `codesign --verify --deep --strict` passed for the certificate-signed app. The app and both helpers use certificate-pinned designated requirements without cdhash clauses.
- Both bundled native helpers are ARM64; app identifier is `app.wheeldesk.desktop`, minimum macOS is 13.0.
- Packaged JavaScript matches the checked production build. LICENSE and NOTICE.md are present; the 15 original textures and 12 WAV sounds are present with attribution; no credentials or node_modules are bundled.
- The 0.1.2 installed app was previously verified through its native accessibility tree. Versions 0.1.5 and 0.1.6 are built in hidden staging; temporary application bundles are unregistered and removed after verification to avoid duplicate application-list entries. The canonical installation is /Applications/WheelDesk.app.

## Not yet accepted on real systems

- macOS 13 specifically has not been tested; this host runs macOS 26.6.
- Global gestures, normal input passthrough, multi-monitor mixed scaling, selected-text extraction, screen capture, clipboard restoration and target-window fill-back still require hands-on OS acceptance. The hook helper initially reported missing Accessibility access and later started successfully, but a running helper alone is not evidence that these interactions passed.
- Real API credentials, live provider rate limits and model image capability require user-configured services. Automated provider tests use mocks.
- GitHub Actions run 43441701375 passed typecheck, native helper tests, JavaScript tests and production build on both Windows and macOS. Windows desktop interaction, installation/uninstallation and executable delivery remain pending.
- The macOS beta uses one persistent internal signing certificate, without Apple notarization. Old ad-hoc installations need one migration authorization. Subsequent updates are required to use the same pinned certificate; missing or changed signing material blocks packaging. OS revocation or a future identity change can still require authorization.

This is an internal beta, not a claim that every item in the original two-platform acceptance plan has passed.


## Permission identity regression (2026-11-15)

- Root cause reproduced on 0.1.4: the Accessibility switch was on while the hook could not create an event tap. TCC denied PostEvent; the app and native helper used ad-hoc cdhash requirements that changed on rebuild.
- Installed 0.1.5 with a fixed certificate and `Contents/Helpers` layout. The UI retained the user's wheel/model configuration and showed the one-time migration guidance. Launch Services had exactly one WheelDesk registration, `/Applications/WheelDesk.app`.
- Built 0.1.6 with a changed app and hook-helper for an actual upgrade comparison. Full tests passed on this revision. Initial sandbox socket tests failed with EPERM; the complete rerun with local sockets allowed passed (2,145 tests).
- With the user’s explicit permission and their Touch ID authentication, removed the stale Accessibility entry and added the canonical 0.1.5 app. It automatically recovered to “轮盘已开启” without clicking Retry. Upgraded to 0.1.6 without changing any privacy settings: the UI displayed version 0.1.6 and “轮盘已开启”, and the signed hook-helper remained running. The app and hook code hashes changed across this upgrade while all three designated requirements stayed identical. A further ordinary restart also showed version 0.1.6 and “轮盘已开启” without another permission step. This verifies Accessibility authorization preservation on this Mac.
- Injected test shortcut events did not produce an observed toggle; physical gesture/input acceptance remains separate and is not claimed from a running helper alone.
