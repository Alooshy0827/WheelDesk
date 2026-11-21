# WheelDesk

[简体中文](README.zh-CN.md) · Internal beta 0.1.11

A desktop action wheel for everyday tools, AI instructions, and local workflows. Hold Alt (Option on macOS) and press the left mouse button to show the wheel immediately. Move to an action and release the mouse button. Move back into the center, press Escape, or right-click to cancel.

Based on [lolPing](https://github.com/darrenprx/lolPing), revision `c97fe772b98514b83f011ee540601faabd066d23`. The MIT license and original attribution are preserved. The original ping-wheel textures, sounds and animation code are reused; their separate Riot Games attribution remains in LICENSE and NOTICE.md. Emotes and room features are not included.

## Features

The settings UI is modified directly from lolPing: its Fluent controls, platform themes, scroll navigation, grouped rows and drag-and-drop wheel editor are reused.

- Original wheel visuals and effects: hover glow/scale, expanding rings, pop/bobbing and All In collision, with original sounds. Each effect is paired with an independent custom function; previewing effects runs no function.
- Multiple editable wheels with 2–12 spokes each (default 8). Shrinking hides the last slots and expanding restores their bindings; switch in the tray or with a wheel action.
- Keyboard shortcuts, applications, files, folders, URLs, clipboard operations and region screenshots.
- OpenAI-compatible and Anthropic APIs, including local endpoints. Choose a model and instruction per action.
- Streamed answer cards with copy and guarded fill-back. Text actions do not automatically send screenshots.
- Linear workflows with explicit inputs and previous-step outputs. Shell on macOS and PowerShell on Windows receive input on stdin.
- One active run, cancellation, per-action timeouts and a 1 MB script-output limit.
- English and Simplified Chinese settings, encrypted API keys, optional login startup.

## Install and use

The current delivery targets macOS 13+ on Apple Silicon. Windows 11 x64 source and native build workflow are included; a Windows installer is deferred.

Open the DMG and drag WheelDesk to Applications. This internal build uses a persistent signing certificate and is not notarized. If macOS blocks it, use System Settings → Privacy & Security → Open Anyway for this application.

1. Open WheelDesk. In Settings, open Accessibility settings and allow WheelDesk, the helper reconnects automatically. Migrating from 0.1.4 or earlier requires removing the old entry and adding /Applications/WheelDesk.app once. Later updates retain the same signing identity.
2. Grant Screen Recording when using screenshots. Screen capture stays off until you choose a screenshot action.
3. In Models, add a service, choose a provider, enter its key, then choose or type a model. Fetch models offers a searchable list. **Save and test connection** sends a short text request and securely saves a typed key only after success; failed tests preserve the previous key. API format/address are configured automatically and hidden under **Advanced settings** by default. Custom services expose the URL directly; local services usually need no key. Tests may incur a small API charge and do not verify image support.
4. In Wheels, choose the spoke count, then drag original effects between positions, then choose each slot’s function in **Bind custom functions**. Swapping effects moves their functions with them; replacing an effect keeps the slot’s function. Click a palette tile to preview it without running its function. Empty function slots still play their selected effects without executing an action. Each position has a custom name, which overrides its function/effect name; leave it blank for automatic naming. Names follow slots when reordered and survive shrinking the wheel. Size, duration, volume and mute are configurable. Changes save automatically; use the tray to switch wheels.
5. To test an action from settings, click Run and switch to the target application within the three-second countdown.

A text action with no readable selection asks for input; it never silently sends the clipboard. Result cards do not activate the app while streaming. Fill-back requires the original window and selection; when they changed, copy the answer instead.

## Workflows

Create reusable actions first, then add ordered workflow steps. Choose each input explicitly: fixed content, selection, clipboard text, manual input, selected screenshot or previous result. A workflow is automatically added to the action library and can be assigned to a wheel slot.

Scripts run as the current user. PowerShell execution policy is set only for the child process. No model-generated commands are executed automatically. Script working directories are temporary; use absolute paths for persistent files. A failed step stops the workflow. Cancellation stops the current script process group/tree; it does not undo steps already completed.

## Build and test

Requires Node 22.12+ and Xcode Command Line Tools on Apple Silicon, or Visual Studio 2022 C++ build tools on Windows.

```sh
npm ci
npx install-electron
npm run test:helper
npm run typecheck
npm test
npm run dev
npm run dist:mac
# On Windows:
npm run dist:win
```

`tools/smoke.cjs` runs the real application against a local mock model and an isolated data folder. After `npm run build`, set `WHEELDESK_DATA_DIR` to a temporary absolute folder and run `npm run smoke`. See [validation](docs/validation.md) for completed checks and unverified OS behavior.

GitHub Actions checks both native platforms on push. **Build internal installers** is manually dispatched and uploads private workflow artifacts; it does not publish releases.

## Data and privacy

Settings are stored separately in `~/Library/Application Support/WheelDesk` or `%APPDATA%\WheelDesk`. API keys are encrypted with Electron safeStorage in `secrets.enc`, never included in ordinary settings. Results are kept in memory for the current run; screenshots and script files are removed after use. Only configured model endpoints receive AI requests. There is no backend account, telemetry, automatic update checker, room service, or cloud sync.

The repository retains upstream source modules and regression tests to preserve compatibility of reused helpers/settings. Its only production main entry is `src/main/wheeldesk.ts`; rooms, agents and emote UI are not started. The original ping wheel and effects are part of WheelDesk. See [NOTICE](NOTICE.md) and [design](docs/wheeldesk.md).

macOS packaging requires the original private signing identity. Hosted Actions deliberately fails macOS packaging until that identity is securely provisioned; never bypass this with ad-hoc signing. See [signing setup and backup](docs/wheeldesk.md#stable-macos-update-identity).

Ordinary system actions run without a result popup. AI and scripts respect their output mode; workflows retain progress and cancellation. Input requests and failures still display the required dialog.

### Custom AI actions

Use **New custom AI action** under any wheel position to create and bind an action, or add one in the action library. Describe the task and select its input, model and output. Generate the understanding now, or let the first run prepare and save it. Unchanged descriptions reuse that instruction across restarts; processing new input still calls the model. Edit the saved understanding directly, or provide revision feedback and regenerate. Changing the description invalidates the old preparation. Cancelled or failed requests preserve the previous content. Built-in actions retain direct-prompt mode.
