import { crayon } from "@crayon/crayon";
import { Style, type StyleBlock } from "@tui/nice";
import type { KeyPress } from "@tui/inputs";

import { tui } from "../tui.ts";

import { intersects } from "./utils.ts";
import { colors } from "./colors.ts";

export type ButtonBlock = StyleBlock;

export type ButtonClass = "base" | "hover" | "active";
interface ButtonState {
  pressed: boolean;
  class: ButtonClass;
  block: ButtonBlock;
}

export interface ButtonOptions {
  keybind?: Partial<KeyPress>;
  onClick?: () => void;
  forceClass?: () => ButtonClass | undefined;
}

type Button = (text: string, options?: ButtonOptions) => ButtonBlock;

export function createButton(styles: Record<ButtonClass, Style>): Button {
  const getState = tui.createLocalStates<ButtonState>((id: string) => ({
    pressed: false,
    class: "base",
    block: styles.base.create(id),
  }));

  return function Button(text: string, options?: ButtonOptions): ButtonBlock {
    const state = getState(text);

    state.associateBlock(state.block);

    state.addEventListener("update", () => {
      if (state.isFocused()) {
        if (state.class === "base") {
          state.class = "hover";
        }
      } else {
        state.class = "base";
      }

      state.block.style = styles[options?.forceClass?.() ?? state.class];
    });

    state.addEventListener("mouse", (mousePress) => {
      if (!intersects(mousePress.x, mousePress.y, state.block.boundingRectangle())) {
        if (state.isFocused()) {
          state.unfocus();
        }
        return;
      }

      state.focus();

      if (mousePress.release) {
        state.class = "hover";
        if (!state.pressed) {
          options?.onClick?.();
          state.pressed = true;
        }
      } else if (mousePress.move) {
        state.class = "hover";
      } else if (mousePress.button === 0) {
        state.class = "active";
        state.pressed = false;
      }
    });

    const keyClick = () => {
      options?.onClick?.();
      state.pressed = true;
      state.class = "active";
      setTimeout(() => {
        state.pressed = false;
        state.class = "base";
      }, 100);
    };

    state.addEventListener("key", (keyPress: KeyPress) => {
      if (keyPress.key !== "return") return;
      if (!state.isFocused()) return;
      keyClick();
    });

    if (options?.keybind) {
      state.addEventListener("key", (keyPress) => {
        if (
          Object.entries(options.keybind!)
            .some(([key, value]) => value !== keyPress[key as keyof KeyPress])
        ) return;

        keyClick();
      });
    }

    return state.block;
  };
}

const base = new Style({
  string: crayon.bgHex(colors.accent).hex(colors.text),
  padding: { x: 3, y: 1 },
});

const hover = base.derive({
  string: crayon.bgHex(colors.accentHigher).hex(colors.textHigher),
});

const active = base.derive({
  string: crayon.bgHex(colors.accentHighest).hex(colors.textHighest),
});

export const Button: Button = createButton({ base, hover, active });
