# WheelDesk UI Design Specification (1:1 League of Legends In-Game Style)

> **Audience**: AI coding agents and human contributors modifying WheelDesk's renderer (`src/renderer/workbench/`), window chrome (`src/main/wheeldesk.ts`), or UI assets (`assets/fonts/`).
> **Canonical Visual Reference**: League of Legends **in-game ESC Options window** (召唤师峡谷游戏内按 `Esc` 打开的选项窗口), **in-game Smart Ping Wheel**, and **Hextech in-game notification/quest modals**.

---

## 1. Core Design Principles

1. **1:1 In-Game Fidelity, Not Generic Dark Mode**:
   - The UI must look like an authentic in-game League of Legends window — deep obsidian-navy surfaces (`#010a13`–`#0a1824`), crisp `1px` sharp corners, double-beveled aged brass/gold framing (`#785a28` / `#c8aa6e`), ornate corner brackets, and restrained Hextech cyan accents (`#0ac8b9`).
   - Do **not** let macOS System Settings styles (`mac.css` rounded `10px` cards, iOS green pill switches, translucent sidebar vibrancy, hidden row icons) or Windows Fluent rounded pills bleed through.
2. **Zero Non-Functional Decorative Copy**:
   - Do **not** add marketing slogans, taglines, or decorative category labels (e.g. "常用操作，触手可及。", "游戏选项 · 分类"). Every visible text element must identify a real section, status, setting, or hint.
3. **Instant Game-UI Response**:
   - In-game option menus open crisply without sluggish staggered fade-in animations. Keep `.wdSettings main.content > *`, `.card`, `.dot`, `.navItem`, and `.brand` free of delayed entrance animations (`animation: none !important`).
4. **Preserve Upstream Wheel Logic & Smoke-Test Contracts**:
   - Never modify upstream `Wheel`, `PingFx`, `SoundBank`, original Riot ping textures/sounds, or break selectors asserted by `tools/smoke.cjs` (see §8).

---

## 2. File Ownership Map

| File | Responsibility |
| --- | --- |
| `src/renderer/workbench/leagueTheme.ts` | Fluent UI v9 `Theme` tokens (Hextech brand ramp, obsidian surfaces, gold strokes, `1px` radii) so Fluent portals (Dropdown/Combobox popups) match the window. |
| `src/renderer/workbench/league-settings.css` | Complete 1:1 LOL in-game ESC options stylesheet, `@font-face` declarations, and high-specificity overrides over `settings.css` and `mac.css`. |
| `src/renderer/workbench/Settings.tsx` | Settings window shell: 4 SVG corner ornaments, centered filigree titlebar, sidebar navigation, main scrolling sections, ability-socket bindings, and bottom options footer bar. |
| `src/renderer/workbench/style.css` | 1:1 Hextech styling for the floating Result Card (`body.result`) and region capture overlay (`.capture-hint`, `.capture-rect`). |
| `src/main/wheeldesk.ts` | Electron `BrowserWindow` setup (`1020×700`, `minWidth: 900`, `minHeight: 540`, opaque `#010a13` backing, no macOS vibrancy, `trafficLightPosition: { x: 24, y: 18 }`). |
| `assets/fonts/cinzel-700.woff2` | Bundled offline SIL OFL 1.1 Latin display font (15 KB, closest free match to `Beaufort for LOL`). |
| `assets/fonts/barlow-condensed-700.woff2` | Bundled offline SIL OFL 1.1 condensed HUD numeric font (15 KB). |
| `NOTICE.md` | Retains MIT, Riot Games media exception, and SIL OFL 1.1 font attribution. |

---

## 3. Color Palette & CSS Tokens

Defined on `body.settings` in `league-settings.css` and mirrored in `leagueTheme.ts` and `style.css`:

| Token | Hex | Usage |
| --- | --- | --- |
| `--lol-hextech` | `#010a13` | Deepest window backing, inner bevel groove, input shadow base. |
| `--lol-panel` | `#07121b` | Default dark card/sidebar fill. |
| `--lol-panel-2` | `#0a1824` | Elevated / hover surface fill. |
| `--lol-gold-1` | `#f0e6d2` | Primary text (warm ivory parchment), active titles, bright highlights, focus outline. |
| `--lol-gold-2` | `#cdbe91` | Secondary labels, inactive nav items, standard button text. |
| `--lol-gold-3` | `#c8aa6e` | Primary metallic gold accents, section diamonds/rules, hover borders, wheel center ring, primary button border. |
| `--lol-gold-4` | `#785a28` | Standard bronze borders (outer frame, buttons, inputs, checkboxes, sockets). |
| `--lol-gold-5` | `#463714` | Hairline dividers, slider track border, recessed numeric readout border. |
| `--lol-grey-1` | `#a09b8c` | Descriptions, hints, muted metadata. |
| `--lol-grey-2` | `#5b5a56` | Inactive status dot; use `#7c7769` for disabled button labels to preserve legibility. |
| `--lol-teal` | `#0ac8b9` | Active/ready Hextech diamond gems, enabled switch label, wheel hover highlight, capture selection border. |
| `--lol-teal-deep` | `#0a323c` | Primary Hextech button fill gradient base. |
| `--lol-red` | `#e84057` | Error status gem, error boxes, failed helper states. |

---

## 4. Typography Specification (Plan A · CN LOL In-Game)

WheelDesk uses **Plan A** (1:1 China-server in-game ESC menu typography — bold, crisp, offline, zero copyright risk):

| Role | CSS Variable / Font Stack | Weight & Treatment |
| --- | --- | --- |
| **Display / Headings** | `--lol-display: 'Cinzel', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Noto Sans CJK SC', -apple-system, sans-serif` | `700`, `letter-spacing: 0.06em–0.12em`, `text-shadow: 0 1px 2px rgba(0,0,0,0.95)`. Latin renders in bundled `Cinzel` Bold; CJK renders in crisp heavy sans (never thin Songti). |
| **UI Body / Nav / Buttons** | `--lol-sans: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Noto Sans CJK SC', -apple-system, sans-serif` | Body `13px/1.45`; card titles `600`; nav & buttons `700` with `0.05em` tracking and `0 1px 2px rgba(0,0,0,0.9)` drop shadow. |
| **HUD Numbers & Badges** | `--lol-hud: 'Barlow Condensed', 'DIN Alternate', 'Bahnschrift', sans-serif` | `700`, `13px–14px`, `letter-spacing: 0.06em`, `font-variant-numeric: tabular-nums`. Used on slider `.value` boxes, `.wdVersionBadge`, and result card step/token counters. |

**Strict Typography Rules**:
- Fonts load strictly offline from `/fonts/*.woff2` (served via `wheeldesk://app/fonts/...` under `default-src 'self'` CSP). Never load remote font URLs.
- **Do not** revert Chinese titles to thin serif fonts (`Songti SC`, `STSong`, `SimSun`).
- **Do not** ship partial CJK font subsets — users enter arbitrary Chinese text in wheel names, custom slot names, prompts, and AI outputs.

---

## 5. Window Shell & Layout Geometry

- **Settings Window (`Settings.tsx`)**:
  - Default size: `1020 × 700` (`minWidth: 900`, `minHeight: 540`).
  - Opaque `#010a13` background on both macOS and Windows (no macOS `vibrancy`, no Windows Mica bleed-through).
  - macOS traffic lights positioned at `{ x: 24, y: 18 }` so they clear the `22×22px` top-left brass corner bracket (`.wdCorner.tl`).
  - 3-row × 2-column CSS Grid on `.app.wdSettings`:
    - Row 1 (`50px`, `grid-column: 1 / -1`): Draggable `.titlebar` with centered gold filigree wings + crest + `WHEELDESK · 选项 / OPTIONS` and right-aligned live status pill (`.wdLivePill`).
    - Row 2 (`minmax(0, 1fr)`): Left `224px` `nav.side` + Right `minmax(0, 1fr)` `main.content` (content inner `max-width: 720px`, centered).
    - Row 3 (`54px`, `grid-column: 1 / -1`): Fixed `.wdFooterBar` with live status diamond on the left and metallic action buttons (`预览手势`, `保存修改`) on the right.
  - Outer border: `2px solid #785a28` with inner dark groove and `rgba(200,170,110,0.34)` metallic inner hairline + 4 SVG corner ornaments (`.wdCorner.tl/tr/bl/br`).

---

## 6. Component Specifications

### 6.1 Sidebar Navigation (`nav.side`)
- Top `.brand`: `46×46px` circular champion-portrait ring (`.wdPortraitRing`, double brass ring + radial teal glow) + `WHEELDESK` title only (no tagline).
- Vertical `.navItem` tabs (`40px` tall, `border-radius: 0`, bottom hairline divider):
  - Leading `6×6px` rotated diamond (`.wdNavDiamond`) + `18×18px` icon + label.
  - Active `.navItem.sel`: `3px` left gold bar, warm horizontal gold gradient sweep (`rgba(200,170,110,0.26)` → transparent), gold top/bottom highlight strokes, glowing filled diamond, and `#f0e6d2` text.
- Bottom `.wdCompassSeal` watermark (hidden below `max-height: 580px`) and `.wdSidebarFoot` (version badge + live status/error + cancel/retry actions).

### 6.2 Cards, Sections & Expanders
- **Section Headers (`.section`)**: Leading `6×6px` rotated gold diamond (`::before`), uppercase bold `#c8aa6e` title, fading gold horizontal rule (`::after`).
- **Setting Cards (`.card`)**: Sharp `1px` corners, `1px solid rgba(120,90,40,0.45)` border, dark vertical obsidian gradient (`rgba(10,24,35,0.92)` → `rgba(5,14,21,0.96)`), subtle top inner gleam, visible `28×28px` bronze-framed icon socket.
- **Hero Status Card (`.card.status`)**: Double gold frame (`border: 1px solid #c8aa6e`, inner `3px` dark gap + `1px` gold hairline), radial Hextech cyan top-left glow, `9×9px` rotated diamond indicator (`.dot`), `52×52px` `.wdStatusRing` crest, and right-aligned toggle.
- **Expanders (`.card.expander`)**: Bronze-bordered chevron button (`.expChevron`), recessed darker `.expBody` (`rgba(3,9,14,0.72)`) with flat inner rows separated by `1px solid rgba(70,55,20,0.42)`.

### 6.3 Interactive Controls (1:1 In-Game Look)
- **Checkboxes (Fluent `<Switch>` styled as LOL Square Checkbox)**:
  - `20×20px` square recessed box (`border-radius: 1px`, `1.5px solid #785a28`).
  - Hide Fluent's round knob SVG; render a crisp CSS checkmark via `::after` when `:checked`, with teal-obsidian gradient fill, `#c8aa6e` border, subtle cyan glow, and visible `开/关` (`On/Off`) label (`#0ac8b9` when checked).
- **Sliders (Fluent `<Slider>`)**:
  - `6px` sharp recessed track (`#02080d`, `1px solid #463714`).
  - Progress fill on `.fui-Slider__rail::before` **must stop precisely at `var(--fui-Slider--progress)`**:
    `linear-gradient(90deg, #694e1f 0%, var(--lol-gold-3) calc(var(--fui-Slider--progress) * 0.78), var(--lol-gold-1) var(--fui-Slider--progress), transparent var(--fui-Slider--progress))`.
  - Thumb: `14×14px` rotated `45deg` faceted gold diamond gem (`translateX(-50%) rotate(45deg)`).
  - Readout (`.value`): Recessed `#030a10` box with `1px solid #463714` border and `--lol-hud` tabular numerals.
- **Buttons (Fluent `<Button>`)**:
  - Standard: Sharp `1px` radius, dark steel gradient (`#1d2329` → `#0c1014`), `1px solid #785a28` border, `#cdbe91` text; hover warms to bronze-gold with `#c8aa6e` border.
  - Primary (**always add `className="wdBtnPrimary"` alongside `appearance="primary"`**): Hextech teal metallic gradient (`#12404b` → `#061b22`), `1.5px solid #c8aa6e` border, inner cyan gleam, `#f0e6d2` text; hover brightens border to `#f0e6d2` with cyan outer glow.
  - Inline input buttons (e.g. `显示`/`隐藏`): compact `22px` height.
- **Inputs, Dropdowns, Comboboxes & Textareas**:
  - Deep recessed `#040b11` fill, `1px solid #785a28` border (`#c8aa6e` hover, `#f0e6d2` focus), `1px` radius, gold expand chevrons.
  - Dropdown `.fui-Listbox`: `#040c14` obsidian panel, `1px solid #785a28` border, gold-tinted hover/selected highlight.
- **Scrollbars**:
  - `7px` wide on all platforms (including macOS), `#02080e` track, vertical metallic gold thumb (`#c8aa6e` → `#785a28`), sharp `0` radius.

### 6.4 Smart Ping Wheel Editor & Bindings
- `.weWheel`: Circular dark obsidian dial with concentric outer brass rings and soft Hextech cyan glow.
- `.weWedge`: Dark iron-slate wedges with `rgba(200,170,110,0.55)` radial dividers; hover/drop highlights in `rgba(10,168,174,0.36)` with `#f0e6d2` stroke.
- `.weCenter` (including `.weCenter.off`): **Keep `opacity: 1`** so the glowing teal center orb (`#1d5d67` → `#041117`, `2.5px solid #c8aa6e`) and `#2ce0d1` cancel label stay luminous.
- `.weTile`: LOL rune/item inventory slot cards (`1px solid #463714`, dark vertical gradient, gold hover rim, bordered `.weWhere` slot badge).
- `.wdBindingSocket`: `42×42px` square bronze-framed ability socket wrapping each slot's ping icon.

### 6.5 Result Card Modal & Capture Overlay (`style.css`)
- **Result Card (`body.result`)**: Opaque `#010a13` window, `2px solid #785a28` outer frame + 4 SVG data-URI brass corner ornaments (`::before` / `::after`), circular gold-rimmed `.brand-mark`, circular brass close button, rotated `#0ac8b9` diamond status indicator, `--lol-hud` step & token counters, and metallic beveled `复制` / `回填` / `取消` buttons.
- **Capture Overlay**: Gold-bordered obsidian `.capture-hint` banner and `#0ac8b9` glowing `.capture-rect` selection marquee.

---

## 7. Checklist When Adding New UI Features

- [ ] Use Fluent UI v9 controls inside `Settings.tsx` so they inherit `leagueTheme` and `league-settings.css` automatically.
- [ ] Mark every primary CTA button with `className="wdBtnPrimary" appearance="primary"`.
- [ ] Put numeric readouts in `.value` (or style with `var(--lol-hud)`).
- [ ] Keep all borders crisp (`border-radius: 1px` or `0`), never introduce macOS rounded cards or iOS switches.
- [ ] Do not add decorative slogans or non-functional subheadings.
- [ ] Provide both Simplified Chinese and English strings in `src/shared/i18n.ts`.
- [ ] Verify visually in a real Electron build (`npm run build`) and run `npm run typecheck`, `npm test`, and `WHEELDESK_SMOKE_GESTURES=1 npm run smoke`.

---

## 8. Smoke-Test & Structural Invariants (Do Not Break)

`tools/smoke.cjs` queries these exact DOM elements and behaviors in the real Settings window:
- `.pageTitle` (must remain mounted and visible)
- `.navItem` (exact count `6`, with `data-section` and `.sel` active class)
- `.wdSidebarFoot` (must display `message` status/error text such as `API 密钥验证失败`, plus the `取消` button while `aiPending`)
- `.weSlot`, `.weTile`, `.wdBinding`, `.wdBindings`
- `[role="combobox"][aria-label="辐数"]`, `.wdBinding [role="combobox"]`, `input[aria-label="位置 N · 自定义名称"]`
- Page text must never contain `lolPing` or `房间`.
