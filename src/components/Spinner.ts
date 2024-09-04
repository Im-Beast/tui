import { crayon } from "@crayon/crayon";
import { computed, type Signal, signal } from "@tui/signals";
import { HorizontalBlock, Style, type StyleBlock } from "@tui/nice";

import { colors } from "./colors.ts";
import { tui } from "../tui.ts";

export type SpinnerBlock = HorizontalBlock & { children: [StyleBlock, StyleBlock] };
interface SpinnerState {
  currentChar: Signal<number>;
  block: SpinnerBlock;
}

// Copied from https://github.com/sindresorhus/cli-spinners/blob/32d0d83bcb5c2415a4fcb068c3b4de4653525676/spinners.json#L568
// deno-fmt-ignore
const spinnerChars = ["⠁", "⠂", "⠄", "⡀", "⡈", "⡐", "⡠", "⣀", "⣁", "⣂", "⣄", "⣌", "⣔", "⣤", "⣥", "⣦", "⣮", "⣶", "⣷", "⣿", "⡿", "⠿", "⢟", "⠟", "⡛", "⠛", "⠫", "⢋", "⠋", "⠍", "⡉", "⠉", "⠑", "⠡", "⢁"];

type Spinner = (label: string) => SpinnerBlock;

export function createSpinner(styles: Record<"text" | "spinner", Style>): Spinner {
  const getState = tui.createLocalStates<SpinnerState>((id) => {
    const currentChar = signal(0);

    return {
      currentChar,
      block: new HorizontalBlock(
        { id: "spinner", gap: 1 },
        styles.spinner.create(
          computed(() => spinnerChars[Math.floor(currentChar.get() % spinnerChars.length)]!),
        ),
        styles.text.create(id),
      ) as SpinnerBlock,
    };
  });

  return function Spinner(label: string): SpinnerBlock {
    const state = getState(label);

    state.addEventListener("update", () => {
      state.currentChar.modify((char) => (char += 0.2));
    });

    return state.block;
  };
}

const text = new Style({
  string: crayon.bgHex(colors.background).hex(colors.text),
  text: {
    horizontalAlign: "center",
    overflow: "ellipsis",
    wrap: "nowrap",
  },
  skipIfTooSmall: true,
});

const spinner = new Style({
  string: crayon.bgHex(colors.background).hex(colors.accent),
  skipIfTooSmall: true,
});

export const Spinner: Spinner = createSpinner({ text, spinner });
