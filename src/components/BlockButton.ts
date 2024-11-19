import type { Block } from "@tui/nice";
import type { KeyPress } from "@tui/inputs";

import { tui } from "../tui.ts";
import { intersects } from "./utils.ts";
import type { ButtonClass, ButtonOptions } from "./mod.ts";
import { type BaseSignal, computed, type Signal, signal } from "@tui/signals";

interface ButtonState {
  class: Signal<ButtonClass>;
  block: BaseSignal<Block>;
  pressed: boolean;
}

type BlockButtonContext<Data> = Data extends string ? string : ({ id: string } & Data);

type BlockButtonCreator<Data> = (id: BlockButtonContext<Data>, buttonClass: ButtonClass) => Block;

type BlockButton<Data> = (data: BlockButtonContext<Data>, options?: ButtonOptions) => BaseSignal<Block>;

export function createBlockButton<Data = string>(creator: BlockButtonCreator<Data>): BlockButton<Data> {
  const getState = tui.createLocalStates<ButtonState>(() => ({
    class: signal("base"),
    pressed: false,
    block: undefined!,
  }));

  return function BlockButton(data: BlockButtonContext<Data>, options?: ButtonOptions): BaseSignal<Block> {
    const id = typeof data === "string" ? data : data.id;
    const state = getState(id);

    state.block ??= computed([state.class], (buttonClass) => creator(data, buttonClass));

    state.associateBlock(state.block);

    state.addEventListener("update", () => {
      if (!state.block.get()) return;

      if (state.isFocused()) {
        if (state.class.peek() === "base") {
          state.class.set("hover");
        }
      } else {
        state.class.set("base");
      }
    });

    state.addEventListener("mouse", (mousePress) => {
      const boundingRectangle = state.block.peek().boundingRectangle();
      if (!boundingRectangle) return;

      if (!intersects(mousePress.x, mousePress.y, boundingRectangle)) {
        if (state.isFocused()) {
          state.unfocus();
        }
        return;
      }

      state.focus();

      if (mousePress.release) {
        state.class.set("hover");
        if (!state.pressed) {
          options?.onClick?.();
          state.pressed = true;
        }
      } else if (mousePress.move) {
        state.class.set("hover");
      } else if (mousePress.button === 0) {
        state.class.set("active");
        state.pressed = false;
      }
    });

    const keyClick = () => {
      options?.onClick?.();
      state.pressed = true;
      state.class.set("active");
      setTimeout(() => {
        state.pressed = false;
        state.class.set("base");
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
