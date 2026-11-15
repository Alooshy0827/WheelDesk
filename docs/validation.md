# Validation / 验证记录

Version: 0.1.9 internal beta. Host: Apple Silicon, macOS 26.6. Target: macOS 13+ Apple Silicon. Windows installer is deferred by request.

## Automated checks

- `npm run typecheck`: passed.
- `npm run test:helper`: 692 input assertions, 544 context assertions, 26 macOS callback assertions; all passed (1,262 total). The context tests include shortcut validation, held modifiers, target changes and elevated targets.
- `npm test`: 137 files passed; 2,162 tests passed, 5 skipped. Includes automatic permission recovery after a grant, suppressing retry loops, failed probes and shutdown during a probe; provider preset persistence, credential clearing on endpoint changes, fixed text-only probes for both protocols, invalid configuration, authentication/rate/model/network/timeout/empty-response errors, plus every spoke count from 2 through 12, odd/even angular boundaries, rendered hit alignment at three scales, per-gesture count snapshots, hidden binding persistence/restoration, original-effect migration, moving effect/function pairs, preserving every binding when resetting replaced effects, gesture snapshots, one-shot dispatch, preview isolation, scaled hit testing, capture cleanup, local asset-origin boundaries, upstream regressions, configuration repair, workflow sequencing/failure/cancel/snapshots, actual scripts, provider fixtures and credential boundaries.
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


## Conditional result windows (0.1.7)

- Regression tests cover silent system actions even when they return text, streamed AI card/copy/paste modes, workflow progress versus completion, and failures of silent actions.
- Real Electron smoke tests passed with isolated configuration and a local model fixture (`smoke-data/quiet-017-final`). Observed actual window `show` events: wheel switching and waiting never opened or flashed the result card. AI output remained visible; errors and manual input still opened their dialogs; cancellation hid the card without reopening it. Native helper reported running. Existing model/UI/effect regression checks also passed.
- Built and verified the DMG using the existing pinned certificate, backed up 0.1.6, and installed 0.1.7 in `/Applications/WheelDesk.app`. Temporary bundles were removed and Launch Services retained only the canonical application.

- Installed 0.1.7 UI confirmed through the native accessibility tree: correct version and “轮盘已开启”; no Accessibility grant was changed for this update. The initial UI inspection timed out during startup, then succeeded once the input helper was running.


## Unbound slot effects (0.1.8)

- Main-process regression tests verify that unbound and newly added spokes play their configured effect once without dispatching an action. Center releases and cancellation add no effect. Empty bindings, localized effect labels and visual choices remain snapshotted even if settings change during the gesture.
- The real Electron smoke suite passed with an isolated configuration and `WHEELDESK_SMOKE_GESTURES=1`. This test-only mode runs the existing native helper with `--simulate`, feeding its protocol into the production InputBridge and DesktopSurfaces without injecting input into the OS. Selecting an unbound All In slot displayed its Chinese effect name, full hover highlighting and the two original collision images; a duplicate release added no second effect, RunState stayed unchanged, and no result window was created. All existing model/UI/effect checks passed as well. This is application integration validation, not a claim of physical mouse acceptance.

- Generated and checksum-verified the 0.1.8 DMG with the existing pinned signer; backed up and replaced the installed 0.1.7 bundle. The install check found only `/Applications/WheelDesk.app` registered, and removed the temporary application bundle.


## Custom slot names (0.1.9)

- Automated checks passed: typecheck, 1,262 native assertions, 2,162 JavaScript tests (137 files; 5 skipped), and production build. Added coverage for older configuration migration, bounded/trimmed names, persistence, drag/replacement behavior, hidden names after resizing, independent copies, and gesture-time name snapshots for bound and unbound slots.
- Real Electron smoke passed using isolated data and the native simulator (`smoke-data/slot-names-019`). Edited the actual custom-name inputs, reloaded settings and restored a twelfth name after shrinking. The other wheel retained its own names. A simulated gesture passed through the production bridge and showed the custom name in both the hover label and original All In effect. Text containing angle brackets remained literal text, and clearing the field persisted the empty fallback value. Prior quiet-action/model/effect checks also passed.
- Visually inspected the settings screenshot: per-position name inputs and action selectors are visible in the original grouped settings card. No user configuration or API keys were used in these tests.

- The 0.1.9 DMG passed checksum and fixed-identity signature checks. Backed up and replaced 0.1.8 at the canonical path, retaining existing user configuration. Temporary app bundles were removed, and Launch Services reported only `/Applications/WheelDesk.app`.
