import { crayon } from "@crayon/crayon";

import {
  type Block,
  calc,
  HorizontalBlock,
  Style,
  type StyleBlock,
  VerticalBlock,
  type VerticalBlockOptions,
} from "@tui/nice";
import {
  computed,
  effect,
  getIntermediate,
  getValue,
  type MaybeSignal,
  type ObservableObject,
  observableObject,
} from "@tui/signals";

import { tui } from "../tui.ts";

import { intersects } from "./utils.ts";
import { colors } from "./colors.ts";

export interface ScrollViewOptions extends VerticalBlockOptions {
  id: string;
}

export type ScrollViewBlock = HorizontalBlock & {
  children: [view: VerticalBlock, scrollbar: StyleBlock];
};

export type ScrollViewState = ObservableObject<{
  scrollbarText: string;
  scrollOffset: number;
  block: ScrollViewBlock;
}>;

type ScrollView = (options: ScrollViewOptions, ...childrenSignals: MaybeSignal<Block>[]) => ScrollViewBlock;

export function createScrollView(scrollbarStyle: Style): ScrollView {
  const getState = tui.createLocalStates<ScrollViewState>(() =>
    observableObject({
      scrollOffset: 0,
      scrollbarText: "",
      block: undefined!,
    })
  );

  function ScrollView(
    options: ScrollViewOptions,
    ...childrenSignals: MaybeSignal<Block>[]
  ): ScrollViewBlock {
    const state = getState(options.id);

    let offset = -1;
    let maxY = 0;
    const updateScrollbar = () => {
      if (state.scrollOffset === offset) return;
      offset = state.scrollOffset;

      const [view] = state.block.children!;

      if (!view?.children) return;

      state.scrollbarText = "";

      let childrenHeight = 0;
      let maxChildHeight = 0;

      for (const childSignal of view.children) {
        const child = getValue(childSignal);
        childrenHeight += child.computedHeight + (childrenHeight && view.computedGap);
        maxChildHeight = Math.max(maxChildHeight, child.computedHeight);
      }

      maxY = childrenHeight - view.computedHeight;
      // We offset it based on the amount of children that can fit into the view
      // so we don't leave any free space after the content in the view
      maxY -= view.computedGap *
        (view.children.length - (Math.round(view.computedHeight / maxChildHeight) - 1));
      state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxY));

      const scrollPosition = Math.min(
        Math.floor(state.scrollOffset / maxY * view.computedHeight),
        view.computedHeight - 1,
      );

      if (maxY > 0) {
        for (let i = 0; i < view.computedHeight; ++i) {
          state.scrollbarText += i === scrollPosition ? "┃" : " ";
          if (i < view.computedHeight - 1) state.scrollbarText += "\n";
        }
      }
    };

    state.addEventListener("update", updateScrollbar);

    state.addEventListener("mouse", (mousePress) => {
      if (!intersects(mousePress.x, mousePress.y, state.block.boundingRectangle())) {
        return;
      }

      if ("scroll" in mousePress) {
        state.scrollOffset += mousePress.scroll! * 2 - 1;
      }

      updateScrollbar();
    });

    state.addEventListener("key", (keyPress) => {
      if (keyPress.key === "up") {
        state.scrollOffset -= 1;
      } else if (keyPress.key === "down") {
        state.scrollOffset += 1;
      }

      state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxY));

      updateScrollbar();
    });

    state.block ??= new HorizontalBlock(
      { id: options.id, width: "100%", height: "100%" },
      new VerticalBlock({
        ...options,
        width: computed(() =>
          state.scrollbarText
            ? calc(`${getValue(options.width)} - ${getValue(scrollbarStyle.width)}`)
            : (getValue(options.width) ?? "auto")
        ),
        y: computed(() => {
          const num = -state.scrollOffset;
          if (Number.isFinite(num)) return num;
          return 0;
        }),
      }),
      scrollbarStyle.create(getIntermediate(state).scrollbarText),
    ) as ScrollViewBlock;

    const refreshChildren = () => {
      const [view] = state.block.children!;

      view.clearChildren();

      for (const child of childrenSignals) {
        const childValue = getValue(child);
        view.addChild(childValue);
      }

      state.block.changed = true;
    };
    effect(refreshChildren);

    return state.block;
  }

  return ScrollView;
}

const scrollbar = new Style({
  width: 2,
  margin: { left: 1 },
  string: crayon.bgHex(colors.accentHigher).hex(colors.textHigher),
});
export const ScrollView: ScrollView = createScrollView(scrollbar);
