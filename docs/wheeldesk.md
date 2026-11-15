# WheelDesk implementation

The fork keeps lolPing's native input state machine, physical/DIP coordinate conversion, settings normalization and atomic persistence, context-helper capture/text/paste implementation, encrypted secrets, and provider adapters. The dedicated hook process never executes actions or network requests.

## Production path

`src/main/wheeldesk.ts` owns SettingsStore, InputBridge, ContextClient, SecretStore, DesktopSurfaces and ActionRunner. The gesture channel is the existing primary wheel; emote, ask, room and text triggers are disabled. Each gesture snapshots wheel slot IDs, original effect IDs, labels and visual/audio settings in the main process. A release is resolved with the shared, equally spaced 2–12-spoke geometry and scaled center radius, spawns the snapshotted effect and dispatches the custom action once. Unbound slots still play their selected effect and sound, without dispatching an action. Cancellations and center releases do neither. Renderers cannot supply executable command source at run time.

`src/shared/actions.ts` defines independently identified actions, wheel profiles, workflow steps, input types and run state. `Settings.workbench` is normalized on every load and save. New settings do not migrate or overwrite an existing lolPing installation.

`src/main/workbench/runner.ts` snapshots the configuration, validates the entire workflow, resolves explicit input sources, runs sequential steps and publishes progress. Runtime input and output are text and/or a JPEG. Abort signals flow into providers, capture and scripts. Current v1 workflows have no loops, branches or nesting. Completed side effects are not rolled back.

`src/main/workbench/surfaces.ts` owns transparent non-activating windows per display and interactive region selection. Region coordinates are converted to the native context helper's coordinate space. Capture files are deleted after reading. A display change dismisses the active wheel.

The context-helper shortcut extension validates vk/modifiers and target window, waits for hands-off, checks responsiveness/elevation, and marks injected input with the upstream self marker. It uses SendInput on Windows and CGEvent on macOS. Existing paste checks preserve selection, protected fields and the clipboard.

## Settings interface

The user requested the original lolPing settings UI, not a separately designed dashboard. `src/renderer/workbench/Settings.tsx` reuses `settings/settings.css`, `settings/mac.css`, `macTheme.ts`, the existing Fluent row components, navigation animation and `WheelEditor`. The native window uses the original macOS sidebar vibrancy/traffic-light placement and Windows Mica caption style. Changes auto-save. The original effect palette and textures remain in the wheel editor. A function selector with one row per visible spoke binds an independent action to each position. Swapping effects moves their actions; replacing an effect preserves the destination action. The center is reserved for cancel. Size, timing and sound controls reuse the original setting limits.

## Configurable spoke count

Each wheel stores a normalized `slotCount` between 2 and 12, defaulting to 8 for older configurations. Its slot/effect arrays retain up to 12 entries; shrinking only hides the tail and growing restores it. Newly added slots are empty. Editing visible effects preserves hidden functions even when their original artwork is reused. Reset affects the current count, not the hidden bindings.

The settings editor and overlay use the same angular division as main-process selection. Main snapshots only active slots/effects per gesture; changing the count cannot change an in-flight selection. Eight spokes keep the original geometry, while other counts divide 360° equally clockwise from the top. The editor reduces icon hit-box sizes at high counts to avoid overlap.

## Original effects

`src/renderer/workbench/Overlay.tsx` directly uses the upstream `Wheel` with configurable sector geometry, plus the unchanged `spawnPing` and `SoundBank`. `wheel-effects.css` is the upstream wheel/ping CSS extracted into a shared stylesheet. Both the editor preview and real selection use these same effects, including All In’s two animated image halves. The wheel’s hover labels show the bound function’s name, or the localized effect name when no function is bound. Unbound slots retain full hover highlighting. Main execution is independent of rendering and does not wait for the effect to finish.

Renderer idle reports hide the transparent window after the original fade/effects finish. Explicit capture or display changes immediately clear effects; capture closes/reset all overlays so animations cannot contaminate a screenshot or leave a stale picker. Effect preview is settings-only IPC and never invokes the action runner.

Older WheelDesk configurations gain the original effect ordering without changing action IDs or slot bindings. Actions and effects remain separate in normalized storage.

## Boundaries

Settings, result cards and overlays share a sandboxed preload. Main validates sender identity and permitted operations: overlays can report capture geometry and idle state; result cards can copy, fill back, provide requested text and cancel; only settings can change configuration, keys or start a test run. Navigation and popup creation are blocked. The renderer has no Node access.

Model requests use the existing OpenAI-compatible/Anthropic streaming adapters with an empty tools array. Each action picks an explicit or default profile. Text-only input remains text-only on the wire. Provider failures are mapped to localized errors without echoing credentials. Keys use safeStorage and are never returned to a renderer.

Scripts are explicit local configuration. Their input is stdin, not code substitution. Each run writes a private temporary script, spawns the platform interpreter without a shell wrapper, bounds stdout/stderr, and kills its process group/tree on cancellation. Windows script files use UTF-8 BOM and console input/output encoding for Unicode text.

## Model presets and connection test

The main form is ordered Provider → API key → Model. Protocol is labeled **OpenAI-compatible format (Chat Completions)** or **Anthropic Messages format**; it and the preset endpoint/name live in the upstream expander, collapsed by default. Custom providers expose their endpoint in the main form. Local providers explain that keys are optional. The editable model combobox supports filtering fetched IDs and manual entry. Profiles can be set as default with one button; new profiles and vendor changes receive readable names, while manually named existing profiles are preserved. Advanced controls allow saving a key without a test or explicitly removing it. Pending operations disable profile switching and form edits.

The model editor offers OpenAI, Anthropic/Claude, DeepSeek, Qwen (China), Kimi (China), Gemini, Ollama, LM Studio and Custom. Selecting a vendor fills its protocol and base URL and clears the model ID; Custom preserves the endpoint. IDs and edited URLs persist. Defaults reuse the upstream provider catalog; regional URLs can be entered manually.

Fetch models remains a separate list request. Test connection sends only a fixed short text prompt through the configured model adapter, with no screenshots, selection, clipboard or tools. It uses the typed key, falling back to the encrypted key when blank. The primary Save and test connection button encrypts a typed key only after a successful response; a failed test leaves the previous key intact. Fetch models never saves a key. A successful response must contain text, with elapsed milliseconds shown; authentication, rate limits, missing endpoints/models, empty responses and 30-second timeout failures are localized. Server error bodies and credentials are not shown. The editor disables fields during the request and ignores results belonging to a previously selected configuration.

Main restricts these commands to the settings renderer and validates input. Changing an endpoint/protocol or deleting a profile clears its encrypted credential before saving; model/name-only edits preserve it. No user data is sent by the connection test. Live vendor/model compatibility still requires a real key.

Preset references: [Qwen regional URLs](https://help.aliyun.com/zh/model-studio/base-url), [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai), [DeepSeek API](https://api-docs.deepseek.com/), [Ollama](https://docs.ollama.com/api/openai-compatibility), [LM Studio](https://lmstudio.ai/docs/developer/openai-compat).

## Distribution

New application ID: `app.wheeldesk.desktop`. Only the workbench renderer is built. The assets publicDir contains the original ping textures and sounds with their media attribution. A secure local wheeldesk://app origin serves only files inside the renderer directory, enabling the original fetch-based Web Audio loader in packaged apps. No updater or relay is initialized. Installers are internal artifacts and not automatically published. See validation.md for actual verification, including OS permission limits.

## Stable macOS update identity

Internal macOS builds use one persistent RSA signing certificate, pinned in `build/desk/signing-identity.json`. `tools/mac-sign.cjs` signs the app and all nested code; the app and both native helpers have explicit certificate-and-identifier designated requirements. A code hash is never the designated requirement. Helpers live in `Contents/Helpers`, where macOS treats them as nested executable code, rather than as resources.

`mac.identity: "-"` only selects electron-builder's custom signer dispatch; the custom hook always replaces it with the pinned certificate. The post-artifact hook verifies the complete signature and certificate-pinned requirements and rejects unsigned/ad-hoc output, including an explicit identity override. A missing/mismatched identity fails the build. Do not remove these checks to make CI green.

The initial identity was created once with `npm run setup:mac-signing` before pinning it. Setup now refuses to create a replacement for this released product. Its private keychain, encrypted PKCS#12 backup and password are in `~/Library/Application Support/WheelDeskBuild` with owner-only access. Keep a secure external backup of this entire directory; do not commit it, bundle it, or upload it as an artifact. Restore the SAME identity on any replacement build machine. `WHEELDESK_SIGNING_CONFIG` can point to a restored `identity.json` with local paths. Add that private keychain to the current user’s keychain search list while preserving existing entries; codesign needs it for identity resolution even with an explicit `--keychain`. Hosted CI does not have this identity and deliberately cannot produce a macOS installer until it is securely provisioned; checks and Windows packaging do not need it. This internal certificate is not Developer ID/notarization and does not add system root trust.

Old ad-hoc installations require one migration authorization because they did not have a persistent identity. Subsequent builds retain the exact certificate and identifiers. The app silently probes AX trust and event-post permission using the signed hook helper every two seconds only while blocked. A newly observed grant reconnects the helper automatically; repeated tap failures do not cause a restart/prompt loop. No privacy database is edited or reset, and no permission is granted automatically. Screen Recording remains separate and is requested only for screenshot use. A future signer replacement, revoked permissions or OS policy change can still require user authorization.


## Result window visibility

Ordinary shortcuts, launching apps/paths/URLs, writing the clipboard, plain-text paste, wheel switching and waiting execute without opening a result window, including intermediate progress events and returned text. AI and scripts open a streaming/progress card only when their output mode is `card`; explicit copy/paste output stays silent on success. Clipboard reads and screenshots show a result only after completion when configured for a card. Screenshot region selection remains available without an extra execution dialog.

Workflows retain progress/cancellation while running, then show a final result only if their last step requests a supported card output. Manual input and failures always retain their necessary UI; cancellation and empty completion do not open another card. The presentation is derived from the same immutable action snapshot as execution. A pending window load rechecks the current run before showing, preventing a stale dialog after cancellation or a new silent action. Repeated gestures during a silent run do not force the result window open.


## Custom slot names

Each wheel stores a `slotNames` array alongside effects and action bindings. Older settings gain empty names without changing their actions or artwork. Names are bounded to 80 UTF-16 units, trimmed and normalized to a single line. Every visible slot has a labeled draft input in the original settings card; Enter or blur saves it. Its placeholder shows the automatic fallback name.

A nonempty custom name takes priority over the localized function/effect name in the wheel hover label and the selected effect label. The editor also displays the custom slot label. Names do not rename shared actions or effects and work for unbound slots. The main process snapshots the resolved name for each gesture; renderer text uses textContent, not HTML. Swaps move the name with the effect/action pair, artwork replacement retains it, reducing the count preserves hidden names, and duplicated wheels have independent copies.
