# Working on WheelDesk

WheelDesk is an independent fork of lolPing at c97fe772b98514b83f011ee540601faabd066d23. Preserve LICENSE and NOTICE.md. The current product targets macOS 13+ Apple Silicon and Windows 11 x64. Linux, emotes, rooms and coding-agent automation are outside the product.

## Entry points

- Production main: src/main/wheeldesk.ts. New execution modules: src/main/workbench/.
- Production renderer: src/renderer/workbench/. Sandboxed preload: src/preload/workbench.ts.
- Shared actions/types/normalization: src/shared/actions.ts. Settings extend src/shared/settings.ts; text is in src/shared/i18n.ts.
- Native hook and context helpers: native/hook-helper/. Do not run actions or network work in the hook process.
- Upstream modules and tests remain for regression coverage. They are not additional product entry points. Read docs/wheeldesk.md and the relevant upstream design section before changing shared code.

## Invariants

The settings UI must retain the upstream lolPing layout and components. Extend its Fluent controls, original platform CSS, grouped rows, scrolling sidebar and wheel editor; do not replace it with a separately designed dashboard.

Ordinary input always passes through unchanged; paused input swallows nothing. A gesture dispatches exactly once from the main process. Preserve multi-monitor coordinate conventions. New settings need normalization/defaults. IPC input is unknown until checked; renderers cannot execute arbitrary commands. Keys are encrypted and never logged or returned to a renderer. A text-only AI action never captures the screen. No model decides which system actions execute.

Use strict TypeScript, two spaces, single quotes and semicolons. Avoid any, non-null assertions and compiler suppression. Keep OS code gated. Use localized English and Simplified Chinese strings. Pin new dependencies exactly. Preserve upstream attribution, including the separate Riot media notice. The user explicitly requested the original ping-wheel effects: reuse upstream Wheel, PingFx, SoundBank, textures, audio and timing; bind functions independently from effect IDs.

## Checks

Run npm run typecheck, npm run test:helper, npm test and npm run build. Test new execution logic by its observable behavior. Test input/overlay changes in a real app on the affected platform; never claim permission-dependent tests passed when the OS blocked them. tools/smoke.cjs runs the real app with an isolated WHEELDESK_DATA_DIR and a local model fixture.

Do not commit node_modules, generated bundles, installers, test data, keys or screenshots of private content. Installer workflow is manual and must not publish releases automatically. Describe actual validation and remaining limitations in docs/validation.md.

On macOS, package temporary .app bundles under an ignored hidden staging directory. After verification, unregister and remove those generated bundles, keeping the DMG and a single canonical /Applications/WheelDesk.app. Do not leave installation-test copies that become duplicate application-list entries. Preserve user data and never reset the global Launch Services database.
