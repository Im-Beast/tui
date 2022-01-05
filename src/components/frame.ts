// Copyright 2021 Im-Beast. All rights reserved. MIT license.
import { drawPixel, drawText } from "../canvas.ts";
import {
  createComponent,
  ExtendedComponent,
  getCurrentStyler,
} from "../tui_component.ts";
import { TuiObject } from "../types.ts";
import { textWidth } from "../util.ts";
import { CreateBoxOptions } from "./box.ts";

interface FrameExtension {
  /** Label's text displayed on the button */
  label?: {
    /** Value of the label */
    text?: string;
  };
  rounded?: boolean;
}

export type CreateFrameOptions =
  & Omit<CreateBoxOptions, "frame">
  & FrameExtension;

/** Not interactive frame component */
export type FrameComponent = ExtendedComponent<"frame", FrameExtension>;

/**
 * Create LabelComponent
 *
 * It is not interactive by default
 *
 * It can be automatically generated by most of the others components by setting `styler.frame` property
 * @param parent - parent of the created box, either tui or other component
 * @param options
 * @example
 * ```ts
 * const tui = createTui(...);
 * ...
 * createFrame(tui, {
 *  rectangle: {
 *    column: 1,
 *    row: 1,
 *    width: 11,
 *    height: 6
 *  },
 * });
 * ```
 */
export function createFrame(
  parent: TuiObject,
  options: CreateFrameOptions,
): FrameComponent {
  const frame: FrameComponent = {
    label: options.label,
    ...createComponent(parent, options, {
      rounded: !!options.rounded,
      name: "frame",
      interactive: false,
      get drawPriority() {
        return Reflect.get(parent, "drawPriority") ?? 0;
      },
      draw(this: FrameComponent) {
        const corners = frame.rounded
          ? ["╭", "╮", "╰", "╯"]
          : ["┌", "┐", "└", "┘"];

        const styler = getCurrentStyler(frame);
        const { row, column, width, height } = frame.rectangle;
        const { canvas } = frame.tui;

        for (let w = 0; w < width; ++w) {
          drawPixel(canvas, {
            column: column + w,
            row: row,
            value: "─",
            styler,
          });

          drawPixel(canvas, {
            column: column + w,
            row: row + height,
            value: "─",
            styler,
          });
        }

        for (let h = 0; h < height; ++h) {
          drawPixel(canvas, {
            column: column,
            row: row + h,
            value: "│",
            styler,
          });

          drawPixel(canvas, {
            column: column + width,
            row: row + h,
            value: "│",
            styler,
          });
        }

        drawPixel(canvas, { column, row, value: corners[0], styler });
        drawPixel(canvas, {
          column,
          row: row + height,
          value: corners[2],
          styler,
        });
        drawPixel(canvas, {
          column: column + width,
          row,
          value: corners[1],
          styler,
        });

        drawPixel(canvas, {
          column: column + width,
          row: row + height,
          value: corners[3],
          styler,
        });

        if (frame.label?.text && width > 4) {
          let text = frame.label.text;

          drawPixel(canvas, { column: column + 1, row, value: "┤", styler });

          let tw = textWidth(text);
          while (tw > width - 3) {
            text = text.slice(0, -1);
            tw = textWidth(text);
          }

          drawPixel(canvas, {
            column: column + tw + 2,
            row,
            value: "├",
            styler,
          });

          drawText(canvas, { column: column + 2, row, text: text, styler });
        }
      },
    }),
  };

  return frame;
}
