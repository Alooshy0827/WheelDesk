import { SoundBank } from '../overlay/soundBank';
import { soundLevel } from '../../shared/settings';

export type UiSoundId =
  | 'nav'
  | 'click'
  | 'confirm'
  | 'checkbox'
  | 'dropdownOpen'
  | 'dropdownSelect'
  | 'hover'
  | 'slot'
  | 'cancel'
  | 'success';

interface UiSoundSpec {
  file: string;
  gain: number;
}

const UI_SOUNDS: Record<UiSoundId, UiSoundSpec> = {
  nav: { file: 'sfx-nav-button-text-click.ogg', gain: 0.65 },
  click: { file: 'sfx-uikit-click-generic.ogg', gain: 0.72 },
  confirm: { file: 'sfx-uikit-button-gold-click.ogg', gain: 0.75 },
  checkbox: { file: 'sfx-uikit-checkbox-click.ogg', gain: 0.8 },
  dropdownOpen: { file: 'sfx-uikit-dropdown-click.ogg', gain: 0.7 },
  dropdownSelect: { file: 'sfx-uikit-dropdown-select.ogg', gain: 0.75 },
  hover: { file: 'sfx-uikit-grid-hover.ogg', gain: 0.4 },
  slot: { file: 'sfx-uikit-framed-icon-click.ogg', gain: 0.7 },
  cancel: { file: 'sfx-uikit-button-circlex-click.ogg', gain: 0.75 },
  success: { file: 'sfx-uikit-reward-toast.ogg', gain: 0.65 },
};

const HOVER_THROTTLE_MS = 70;

let bank: SoundBank | null = null;
let loadPromise: Promise<string[]> | null = null;
let masterLevel = 0.7;
let lastHoverAt = 0;

function getBank(): SoundBank | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!bank) bank = new SoundBank();
  if (!loadPromise) {
    const entries = (Object.entries(UI_SOUNDS) as [UiSoundId, UiSoundSpec][]).map(([key, spec]) => ({
      key,
      url: `../ui-sounds/${spec.file}`,
    }));
    loadPromise = bank.load(entries);
  }
  return bank;
}

/** Preloads and decodes all UI interaction sounds into Web Audio buffers. */
export function preloadUiSounds(): void {
  void getBank();
}

/** Syncs UI sound playback volume with WheelDesk's global volume and mute settings. */
export function setUiAudioSettings(audio: { volume: number; muted: boolean }): void {
  masterLevel = soundLevel(audio);
}

/** Plays a single UI interaction sound, respecting mute, volume, and hover throttling. */
export function playUiSound(id: UiSoundId): void {
  if (masterLevel <= 0) return;
  if (id === 'hover') {
    const now = performance.now();
    if (now - lastHoverAt < HOVER_THROTTLE_MS) return;
    lastHoverAt = now;
  }
  const activeBank = getBank();
  if (!activeBank) return;
  const spec = UI_SOUNDS[id];
  activeBank.play(id, Math.min(1, masterLevel * spec.gain));
}

function isDisabled(el: Element): boolean {
  return el.matches(':disabled, [aria-disabled="true"]') || Boolean(el.closest('fieldset:disabled'));
}

/** Attaches delegated LOL UI interaction sound triggers to the settings window and Fluent portals. */
export function attachSettingsUiSounds(root: HTMLElement): () => void {
  preloadUiSounds();
  let lastHovered: Element | null = null;

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Fluent Dropdown/Combobox popups render in a portal outside `root`.
    const option = target.closest('[role="option"]');
    if (option && !isDisabled(option)) {
      playUiSound('dropdownSelect');
      return;
    }

    if (!root.contains(target)) return;

    const nav = target.closest('.navItem');
    if (nav) {
      playUiSound('nav');
      return;
    }

    const slot = target.closest('.weSlot');
    if (slot) {
      playUiSound('slot');
      return;
    }

    // `.weTile` triggers the real Riot ping preview sound; avoid layering a UI click on top.
    if (target.closest('.weTile')) return;

    const dropdown = target.closest('.fui-Dropdown, .fui-Combobox__button');
    if (dropdown && !isDisabled(dropdown)) {
      playUiSound('dropdownOpen');
      return;
    }

    const sfxEl = target.closest<HTMLElement>('[data-sfx]');
    if (sfxEl && !isDisabled(sfxEl)) {
      const explicit = sfxEl.dataset.sfx;
      if (explicit === 'cancel' || explicit === 'confirm' || explicit === 'click') {
        playUiSound(explicit);
        return;
      }
    }

    const button = target.closest('button');
    if (button && !isDisabled(button)) {
      if (button.classList.contains('wdBtnPrimary')) playUiSound('confirm');
      else playUiSound('click');
      return;
    }

    const expHead = target.closest('.expHead');
    if (expHead) {
      playUiSound('click');
    }
  };

  const onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !root.contains(target)) return;
    if (target.classList.contains('fui-Switch__input')) {
      playUiSound('checkbox');
    }
  };

  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !root.contains(target)) return;
    if (target.classList.contains('fui-Slider__input')) {
      playUiSound('hover');
    }
  };

  const onPointerOver = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !root.contains(target)) {
      lastHovered = null;
      return;
    }
    const hoverable = target.closest('.navItem, .weSlot, .weTile, .fui-Button.wdBtnPrimary');
    if (!hoverable || isDisabled(hoverable)) {
      lastHovered = null;
      return;
    }
    if (hoverable !== lastHovered) {
      lastHovered = hoverable;
      playUiSound('hover');
    }
  };

  const onDrop = (event: DragEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('.weSlot, .weWedge')) {
      playUiSound('slot');
    }
  };

  document.addEventListener('click', onClick, true);
  root.addEventListener('change', onChange, true);
  root.addEventListener('input', onInput, true);
  root.addEventListener('pointerover', onPointerOver, true);
  root.addEventListener('drop', onDrop, true);

  return () => {
    document.removeEventListener('click', onClick, true);
    root.removeEventListener('change', onChange, true);
    root.removeEventListener('input', onInput, true);
    root.removeEventListener('pointerover', onPointerOver, true);
    root.removeEventListener('drop', onDrop, true);
  };
}
