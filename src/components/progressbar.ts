// Copyright 2023 Im-Beast. All rights reserved. MIT license.
import { Box } from "./box.ts";
import { Theme } from "../theme.ts";
import { ComponentOptions } from "../component.ts";

import { BoxPainter } from "../canvas/painters/box.ts";
import { TextPainter } from "../canvas/painters/text.ts";

import { normalize } from "../utils/numbers.ts";

import type { DeepPartial } from "../types.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";

export type ProgressBarCharMapType = {
  vertical: string[];
  horizontal: string[];
};

export const progressBarCharMap: ProgressBarCharMapType = {
  vertical: ["█", "🮆", "🮅", "🮄", "🮃", "🮂", "▔"],
  horizontal: ["█", "▉", "▉", "▊", "▋", "▍", "▎", "▏"],
};

export type ProgressBarOrientation = "vertical" | "horizontal";
export type ProgressBarDirection = "normal" | "reversed";

export interface ProgressBarTheme extends Theme {
  progress: Theme;
}

export interface ProgressBarOptions extends ComponentOptions {
  min: number | Signal<number>;
  max: number | Signal<number>;
  value: number | Signal<number>;
  smooth: boolean | Signal<boolean>;
  direction: ProgressBarDirection | Signal<ProgressBarDirection>;
  orientation: ProgressBarOrientation | Signal<ProgressBarOrientation>;
  charMap?: ProgressBarCharMapType | Signal<ProgressBarCharMapType>;

  theme: DeepPartial<ProgressBarTheme, "progress">;
}

/**
 * Component for creating interactive progressbars
 *
 * @example
 * ```ts
 * new ProgressBar({
 *  parent: tui,
 *  orientation: "horizontal",
 *  direction: "normal",
 *  theme: {
 *   base: crayon.bgLightBlue,
 *   focused: crayon.bgCyan,
 *   active: crayon.bgBlue,
 *   progress: {
 *    base: crayon.bgLightBlue.green,
 *    focused: crayon.bgCyan.lightGreen,
 *    active: crayon.bgBlue.lightYellow,
 *   },
 *  },
 *  value: 50,
 *  min: 0,
 *  max: 100,
 *  smooth: false,
 *  rectangle: {
 *   column: 48,
 *   height: 2,
 *   row: 3,
 *   width: 10,
 *  },
 *  zIndex: 0,
 * });
 * ```
 *
 * You can make the progressbar vertical by changing `orientation`
 * @example
 * ```ts
 * new ProgressBar({
 *  ...,
 *  orientation: "vertical",
 * });
 * ```
 *
 * You can reverse the flow of progress by changing `direction` to "reversed"
 * @example
 * ```ts
 * new ProgressBar({
 *  ...,
 *  direction: "reversed",
 * });
 * ```
 *
 * You can also make progress seem more granular by taking advantage of special characters.
 * Set smooth to `true` to do that.
 * @example
 * ```ts
 * new ProgressBar({
 *  ...,
 *  smooth: true,
 * });
 * ```
 */
export class ProgressBar extends Box {
  declare drawnObjects: { box: BoxPainter; progress: BoxPainter | TextPainter };
  declare theme: ProgressBarTheme;

  min: Signal<number>;
  max: Signal<number>;
  value: Signal<number>;
  smooth: Signal<boolean>;
  direction: Signal<ProgressBarDirection>;
  orientation: Signal<ProgressBarOrientation>;
  charMap: Signal<ProgressBarCharMapType>;

  constructor(options: ProgressBarOptions) {
    super(options);

    const { min, max, value, smooth, direction, orientation, charMap } = options;
    this.min = signalify(min);
    this.max = signalify(max);
    this.value = signalify(value);
    this.smooth = signalify(smooth);
    this.direction = signalify(direction);
    this.orientation = signalify(orientation);
    this.charMap = signalify(charMap ?? progressBarCharMap);
  }

  draw(): void {
    super.draw();

    if (this.smooth.peek()) {
      const progressLineRectangle = { column: 0, row: 0, width: 0, height: 0 };
      const progressText = [""];
      const progressLine = new TextPainter({
        canvas: this.tui.canvas,
        multiCodePointSupport: true,
        view: this.view,
        zIndex: this.zIndex,
        style: new Computed(() => this.theme.progress[this.state.value]),
        rectangle: new Computed(() => {
          const { column, row } = this.rectangle.value;
          progressLineRectangle.column = column;
          progressLineRectangle.row = row;
          return progressLineRectangle;
        }),
        text: new Computed(() => {
          const charMap = this.charMap.value[this.orientation.value];
          const step = 1 / (charMap.length);

          const { width, height } = this.rectangle.value;

          let normalizedValue = normalize(this.value.value, this.min.value, this.max.value);
          if (this.direction.value === "reversed") normalizedValue = 1 - normalizedValue;

          if (this.orientation.value === "horizontal") {
            const steps = normalizedValue * width;
            const remainder = steps % 1;

            const line = charMap[0].repeat(steps) +
              (
                remainder < step ? "" : charMap[charMap.length - Math.max(Math.round(remainder / step), 1)]
              );

            for (let offset = 0; offset < height; ++offset) {
              progressText[offset] = line;
            }
          } else {
            const steps = normalizedValue * height;

            const remainder = steps % 1;

            for (let offset = 0; offset < height; ++offset) {
              let line: string;
              if (offset - 1 >= steps - remainder) {
                line = "";
              } else if (offset < steps - remainder) {
                line = charMap[0].repeat(width);
              } else {
                line = remainder < step
                  ? ""
                  : charMap[charMap.length - Math.max(Math.round(remainder / step), 1)].repeat(width);
              }

              progressText[offset] = line;
            }
          }

          return progressText;
        }),
      });

      this.drawnObjects.progress = progressLine;
      progressLine.draw();
    } else {
      const progressRectangle = { column: 0, row: 0, width: 0, height: 0 };
      const progress = new BoxPainter({
        canvas: this.tui.canvas,
        view: this.view,
        zIndex: this.zIndex,
        style: new Computed(() => this.theme.progress[this.state.value]),
        rectangle: new Computed(() => {
          let normalizedValue = normalize(this.value.value, this.min.value, this.max.value);
          if (this.direction.value === "reversed") normalizedValue = 1 - normalizedValue;

          const { column, row, width, height } = this.rectangle.value;
          progressRectangle.column = column;
          progressRectangle.row = row;

          if (this.orientation.value === "horizontal") {
            progressRectangle.width = Math.round(width * normalizedValue);
            progressRectangle.height = height;
          } else {
            progressRectangle.width = width;
            progressRectangle.height = Math.round(height * normalizedValue);
          }

          return progressRectangle;
        }),
      });

      this.drawnObjects.progress = progress;
      progress.draw();
    }
  }

  interact(method: "mouse" | "keyboard"): void {
    const interactionInterval = Date.now() - this.lastInteraction.time;

    this.state.value = this.state.peek() === "focused" && (interactionInterval < 500 || method === "keyboard")
      ? "active"
      : "focused";

    super.interact(method);
  }
}
