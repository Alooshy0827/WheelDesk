# WheelDesk implementation

The fork keeps lolPing's native input state machine, physical/DIP coordinate conversion, settings normalization and atomic persistence, context-helper capture/text/paste implementation, encrypted secrets, and provider adapters. The dedicated hook process never executes actions or network requests.

## Production path

`src/main/wheeldesk.ts` owns SettingsStore, InputBridge, ContextClient, SecretStore, DesktopSurfaces and ActionRunner. The gesture channel is the existing primary wheel; emote, ask, room and text triggers are disabled. Each gesture snapshots wheel slot IDs, original effect IDs, labels and visual/audio settings in the main process. A release is resolved with the shared, equally spaced 2–12-spoke geometry and scaled center radius, spawns the snapshotted effect and dispatches the custom action once. Empty slots and cancellations do neither. Renderers cannot supply executable command source at run time.

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

`src/renderer/workbench/Overlay.tsx` directly uses the upstream `Wheel` with configurable sector geometry, plus the unchanged `spawnPing` and `SoundBank`. `wheel-effects.css` is the upstream wheel/ping CSS extracted into a shared stylesheet. Both the editor preview and real selection use these same effects, including All In’s two animated image halves. The wheel’s hover labels show the bound function’s name. Main execution is independent of rendering and does not wait for the effect to finish.

Renderer idle reports hide the transparent window after the original fade/effects finish. Explicit capture or display changes immediately clear effects; capture closes/reset all overlays so animations cannot contaminate a screenshot or leave a stale picker. Effect preview is settings-only IPC and never invokes the action runner.

Older WheelDesk configurations gain the original effect ordering without changing action IDs or slot bindings. Actions and effects remain separate in normalized storage.

## Boundaries

Settings, result cards and overlays share a sandboxed preload. Main validates sender identity and permitted operations: overlays can report capture geometry and idle state; result cards can copy, fill back, provide requested text and cancel; only settings can change configuration, keys or start a test run. Navigation and popup creation are blocked. The renderer has no Node access.

Model requests use the existing OpenAI-compatible/Anthropic streaming adapters with an empty tools array. Each action picks an explicit or default profile. Text-only input remains text-only on the wire. Provider failures are mapped to localized errors without echoing credentials. Keys use safeStorage and are never returned to a renderer.

Scripts are explicit local configuration. Their input is stdin, not code substitution. Each run writes a private temporary script, spawns the platform interpreter without a shell wrapper, bounds stdout/stderr, and kills its process group/tree on cancellation. Windows script files use UTF-8 BOM and console input/output encoding for Unicode text.

## Distribution

New application ID: `app.wheeldesk.desktop`. Only the workbench renderer is built. The assets publicDir contains the original ping textures and sounds with their media attribution. A secure local wheeldesk://app origin serves only files inside the renderer directory, enabling the original fetch-based Web Audio loader in packaged apps. No updater or relay is initialized. Installers are internal artifacts and not automatically published. See validation.md for actual verification, including OS permission limits.
