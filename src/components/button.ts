// Copyright 2023 Im-Beast. All rights reserved. MIT license.
import { ComponentOptions } from "../component.ts";
import { Box } from "./box.ts";

import { Label, LabelAlign, LabelRectangle } from "./label.ts";
import { Signal, SignalOfObject } from "../signals/mod.ts";
import { signalify } from "../utils/signals.ts";
import { splitToArray } from "../utils/strings.ts";
import { Computed } from "../signals/computed.ts";

import { TextPainter } from "../canvas/painters/text.ts";
import type { BoxPainter } from "../canvas/painters/box.ts";

const centerAlign: LabelAlign = { horizontal: "center", vertical: "center" };

export interface ButtonOptions extends ComponentOptions {
  label?: {
    text: string | Signal<string>;
    align?: LabelAlign | SignalOfObject<LabelAlign>;
  };
}

/**
 * Component for creating interactive button
 *
 * @example
 * ```ts
 * new Button({
 *  parent: tui,
 *  label: { text: "click\nme" },
 *  theme: {
 *    base: crayon.bgGreen,
 *    focused: crayon.bgLightGreen,
 *    active: crayon.bgYellow,
 *  },
 *  rectangle: {
 *    column: 1,
 *    row: 1,
 *    height: 5,
 *    width: 10,
 *  },
 *  zIndex: 0,
 * });
 * ```
 */
export class Button extends Box {
  declare drawnObjects: { box: BoxPainter; text?: TextPainter };

  label: {
    text: Signal<string>;
    align: Signal<LabelAlign>;
  };

  textLines?: string;

  constructor(options: ButtonOptions) {
    super(options);

    let { label } = options;

    label ??= { text: "", align: centerAlign };
    label.text = signalify(label.text);
    label.align = signalify(label.align ?? centerAlign);

    this.label = label as this["label"];
  }

  draw(): void {
    super.draw();

    const currentText = this.label.text.peek();
    const textLines: string[] = currentText.split("\n");

    const text = new TextPainter({
      canvas: this.tui.canvas,
      view: this.view,
      style: this.style,
      zIndex: this.zIndex,
      rectangle: this.rectangle,
      alignHorizontally: 0.5,
      alignVertically: 0.5,
      multiCodePointSupport: true,
      overwriteRectangle: true,
      text: new Computed(() => {
        const text = this.label.text.value;
        splitToArray(text, "\n", textLines);
        return textLines;
      }),
    });

    this.drawnObjects.text = text;

    if (currentText) {
      text.draw();
    }
  }

  interact(method: "mouse" | "keyboard"): void {
    const interactionInterval = Date.now() - this.lastInteraction.time;

    this.state.value = this.state.peek() === "focused" && (interactionInterval < 500 || method === "keyboard")
      ? "active"
      : "focused";

    super.interact(method);
  }

  #updateLabelSubcomponent(): void {
    if (!this.label.text.value) {
      this.subComponents.label?.destroy();
      return;
    }

    if (this.subComponents.label) {
      return;
    }

    const label = new Label({
      parent: this,
      theme: this.theme,
      zIndex: this.zIndex,
      rectangle: this.rectangle as Signal<LabelRectangle>,
      overwriteRectangle: true,
      text: this.label.text,
      align: this.label.align,
      multiCodePointSupport: true,
    });

    label.state = this.state;
    label.style = this.style;

    label.subComponentOf = this;
    this.subComponents.label = label;
  }
}
