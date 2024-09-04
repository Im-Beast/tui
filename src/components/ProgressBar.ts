import { crayon } from "@crayon/crayon";
import { type BaseSignal, computed, type Signal, signal } from "@tui/signals";
import { Style, type StyleBlock, VerticalBlock } from "@tui/nice";

import { colors } from "./colors.ts";
import { tui } from "../tui.ts";

export type ProgressBarBlock = VerticalBlock & { children: [StyleBlock, StyleBlock] };
interface ProgressBarState {
  width: Signal<number>;
  labelText: Signal<string>;
  progressText: Signal<string>;
  block: ProgressBarBlock;
}

type ProgressBar = <T extends bigint | number>(
  label: string,
  valueSignal: BaseSignal<T>,
  maxSignal: BaseSignal<T>,
) => ProgressBarBlock;

export function createProgressBar(styles: Record<"text" | "filled", Style>): ProgressBar {
  const getState = tui.createLocalStates<ProgressBarState>((label) => {
    const width = signal(0);
    const labelText = signal("");
    const progressText = signal("");

    return {
      width,
      labelText,
      progressText,
      block: new VerticalBlock(
        { id: label, width: (w) => (width.set(w), w), x: "50%" },
        styles.text.create(labelText),
        styles.filled.create(progressText),
      ) as ProgressBarBlock,
    };
  });

  return function ProgressBar<T extends bigint | number>(
    label: string,
    valueSignal: BaseSignal<T>,
    maxSignal: BaseSignal<T>,
  ): ProgressBarBlock {
    const state = getState(label);

    const progressSignal = computed(() => {
      const value = valueSignal.get();
      const max = maxSignal.get();

      if (max == 0) {
        return 0;
      } else if (typeof value === "bigint") {
        return Number((value * 1000n) / (max as bigint)) / 1000;
      } else {
        return value / max;
      }
    });

    state.addEventListener("update", () => {
      const value = valueSignal.get();
      const max = maxSignal.get();
      const progress = progressSignal.get();
      const width = state.width.get();

      state.labelText.set(`${value}/${max} (${(progress * 100).toFixed(1)}%)`);
      state.progressText.set("█".repeat(width * progress));
    });

    return state.block;
  };
}

const text = new Style({
  width: "100%",
  string: crayon.bgHex(colors.background).hex(colors.text),
  text: {
    horizontalAlign: "center",
    overflow: "ellipsis",
    wrap: "nowrap",
  },
  skipIfTooSmall: true,
});

const filled = new Style({
  width: "100%",
  string: crayon.bgHex(colors.backgroundHigher).hex(colors.accent),
  skipIfTooSmall: true,
});

export const ProgressBar: ProgressBar = createProgressBar({ text, filled });
