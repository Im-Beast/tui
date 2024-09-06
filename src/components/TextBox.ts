import { crayon } from "@crayon/crayon";
import { computed, getIntermediate, type ObservableObject, observableObject, type Signal, signal } from "@tui/signals";
import { OverlayBlock, Style, type StyleBlock } from "@tui/nice";
import type { KeyPress } from "@tui/inputs";

import { tui } from "../tui.ts";

import { colors } from "./colors.ts";
import { intersects } from "./utils.ts";
import { cropStart } from "@tui/strings";

export type TextBoxBlock = OverlayBlock & {
  children: [StyleBlock, StyleBlock];
};
export type TextBoxClass = "base" | "hover" | "active";

interface TextBoxState {
  lines: Signal<string[]>;
  cursor: ObservableObject<{
    x: number;
    y: number;
    visible: boolean;
  }>;
  class: TextBoxClass;
  block: TextBoxBlock;
  options: TextBoxOptions;
}

export interface TextBoxOptions {
  // TODO: value signal
  keybind?: Partial<KeyPress>;
  multiline?: boolean;
  password?: boolean;
  pattern?: RegExp;
  onChange?(value: string): void;
  onConfirm?(value: string): void;
}

type TextBox = (placeholder: string, options?: TextBoxOptions) => TextBoxBlock;

export function createTextBox(styles: Record<TextBoxClass | "cursor", Style>): TextBox {
  const getState = tui.createLocalStates<TextBoxState>((placeholder) => {
    // TODO: Change to observable array
    const lines = signal([""]);
    const cursor = observableObject({ x: 0, y: 0, visible: false });
    const options = observableObject<TextBoxOptions>({});

    const { padding, margin, border } = styles.base;
    const cursorOffset = observableObject({
      startY: padding.top + margin.top + (border.top ? 1 : 0),
      endY: padding.bottom + margin.bottom + (border.bottom ? 1 : 0),
      startX: padding.left + margin.left + (border.left ? 1 : 0),
      endX: padding.right + margin.right + (border.right ? 1 : 0),
      additionalY: 0,
    });

    const textBlockText = signal("");
    const textBoxBlock = styles.base.create(textBlockText);

    computed([lines, getIntermediate(cursor).x, getIntermediate(cursor).y], (lines, cursorX, cursorY) => {
      if (lines.length === 1 && !lines[0]) {
        textBlockText.set(placeholder);
        return;
      }

      let linesCopy = Array.from(lines);

      const contentWidth = textBoxBlock.computedWidth -
        cursorOffset.startX - cursorOffset.endX;
      const contentHeight = textBoxBlock.computedHeight -
        cursorOffset.startY - cursorOffset.endY;

      if (cursorY >= contentHeight) {
        linesCopy.splice(0, cursorY - 1);
        cursorOffset.additionalY = cursorY - 1;
      } else {
        cursorOffset.additionalY = 0;
      }

      if ((cursorX - 1) >= contentWidth) {
        linesCopy = linesCopy
          .map((line) => cropStart(line, contentWidth - 1));
      }

      if (options?.password) {
        textBlockText.set(
          linesCopy.map((line) => "*".repeat(line.length)).join("\n"),
        );
      } else {
        textBlockText.set(linesCopy.join("\n"));
      }
    });

    const cursorBlock = styles.cursor.create(computed(() => {
      return lines.get()[cursor.y]?.[cursor.x] ?? " ";
    }));

    return {
      lines,
      cursor,
      class: "base",
      options,
      block: new OverlayBlock({
        id: placeholder,
        bg: textBoxBlock,
        fg: cursorBlock,
        x: computed(() => (width) => {
          const value = Math.min(
            cursorOffset.startX + cursor.x,
            width - cursorOffset.endX,
          );

          return cursor.visible ? value : -cursorOffset.startX;
        }),
        y: computed(() => (height) => (
          Math.max(
            cursorOffset.startY,
            Math.min(
              cursorOffset.startY + cursor.y -
                cursorOffset.additionalY,
              height - cursorOffset.endY,
            ),
          )
        )),
      }) as TextBoxBlock,
    };
  });

  return function TextBox(placeholder: string, options?: TextBoxOptions): TextBoxBlock {
    const state = getState(placeholder);

    state.associateBlock(state.block);

    Object.assign(state.options, options);

    state.addEventListener("update", () => {
      state.block.changed = true;

      const [bg] = state.block.children;
      if (state.isFocused()) {
        if (state.class === "base") {
          state.class = "hover";
        }
        state.cursor.visible = true;
      } else {
        state.cursor.visible = false;
        state.class = "base";
      }

      bg.style = styles[state.class];
    });

    state.addEventListener("mouse", (mousePress) => {
      if (
        !intersects(
          mousePress.x,
          mousePress.y,
          state.block.boundingRectangle(),
        )
      ) {
        if (state.isFocused()) {
          state.unfocus();
        }
        return;
      }

      state.focus();

      if (mousePress.release) {
        state.class = "base";
      } else if (mousePress.move) {
        state.class = "hover";
      } else if (mousePress.button === 0) {
        state.class = "active";
      }
    });

    state.addEventListener("key", ({ key, ctrl, alt, meta }) => {
      if (!state.isFocused()) return;
      if (alt || meta || ctrl) return;

      const { cursor, lines } = state;
      const previousValue = lines.get().join("\n");

      try {
        let char: string;
        switch (key) {
          case "home":
            cursor.x = 0;
            return;
          case "end":
            cursor.x = lines.get()[cursor.y]!.length;
            return;

          case "return":
            if (!options?.multiline) {
              options?.onConfirm?.(previousValue);
              return;
            }

            lines.modify((lines) => {
              const line = lines[cursor.y]!;
              const currentLine = line.slice(0, cursor.x);
              const nextLine = line.slice(cursor.x);

              lines[cursor.y] = currentLine;
              lines.splice(cursor.y + 1, 0, nextLine);
              return lines;
            });
            cursor.x = 0;
            cursor.y += 1;
            return;

          case "up":
            cursor.y -= 1;
            return;
          case "down":
            cursor.y += 1;
            return;
          case "left":
            cursor.x -= 1;
            return;
          case "right":
            cursor.x += 1;
            return;

          case "backspace":
            if (cursor.x > 0) {
              lines.modify((lines) => {
                const line = lines[cursor.y]!;
                lines[cursor.y] = line.slice(0, cursor.x - 1) +
                  line.slice(cursor.x);
                return lines;
              });
              cursor.x -= 1;
            } else if (cursor.y > 0) {
              lines.modify((lines) => {
                cursor.x = lines[cursor.y - 1]!.length;
                lines[cursor.y - 1] += lines.splice(
                  cursor.y,
                  1,
                )[0]!;
                return lines;
              });
              cursor.y -= 1;
            }
            return;
          case "delete": {
            const linesValue = lines.get()!;
            const line = linesValue[cursor.y]!;

            if (cursor.x < line.length) {
              lines.modify((lines) => {
                lines[cursor.y] = line.slice(0, cursor.x) +
                  line.slice(cursor.x + 1);
                return lines;
              });
            } else if (cursor.y < (linesValue.length - 1)) {
              lines.modify((lines) => {
                lines[cursor.y] += lines.splice(
                  cursor.y + 1,
                  1,
                )[0]!;
                return lines;
              });
            }

            return;
          }

          case "space":
            char = " ";
            break;
          default:
            if (key.length === 1) {
              char = key;
              break;
            }
            return;
        }

        state.lines.modify((lines) => {
          const line = lines[state.cursor.y]!;
          lines[state.cursor.y] = line.slice(0, state.cursor.x) +
            char + line.slice(state.cursor.x);
          return lines;
        });
        state.cursor.x += 1;
      } finally {
        state.cursor.y = Math.max(
          0,
          Math.min(state.cursor.y, lines.get().length - 1),
        );
        state.cursor.x = Math.max(
          0,
          Math.min(
            state.cursor.x,
            lines.get()[state.cursor.y]!.length,
          ),
        );

        const currentValue = lines.get().join("\n");
        if (previousValue !== currentValue) {
          options?.onChange?.(currentValue);
        }
      }
    });

    return state.block;
  };
}

const base = new Style({
  width: "100%",
  height: 5,
  string: crayon.bgHex(colors.backgroundHigher).hex(colors.textHigher),
  text: { wrap: "nowrap" },
  border: {
    all: crayon.hex(colors.text),
    type: "rounded",
  },
});

const hover = base.derive({
  string: crayon.bgHex(colors.backgroundHigher).hex(colors.textHigher),
  border: { all: crayon.hex(colors.accent) },
});

const active = hover.derive({
  border: { all: crayon.hex(colors.accentHigher) },
});

const cursor = new Style({
  width: 1,
  height: 1,
  string: crayon.bgHex(colors.accent).hex(colors.text),
});

export const TextBox: TextBox = createTextBox({ base, hover, active, cursor });
