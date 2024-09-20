import { crayon } from "@crayon/crayon";

import {
  type Block,
  calc,
  HorizontalBlock,
  type HorizontalBlockOptions,
  Style,
  type StyleBlock,
  VerticalBlock,
} from "@tui/nice";
import { type BaseSignal, computed, type MaybeSignal, type Signal, signal } from "@tui/signals";

import { tui } from "../tui.ts";

import { intersects, stripe } from "./utils.ts";
import { colors } from "./colors.ts";

export interface ScrollViewOptions extends HorizontalBlockOptions {
  id: string;
}

export type ScrollViewBlock = HorizontalBlock & {
  children: [view: VerticalBlock, scrollbar: StyleBlock];
};

export interface ScrollViewState {
  block: ScrollViewBlock;
  blockHeight: Signal<number>;
  childrenHeight: Signal<number>;
  offset: Signal<number>;
  scrollbar: BaseSignal<string>;
}

type ScrollView = (options: ScrollViewOptions, ...childrenSignals: MaybeSignal<Block>[]) => ScrollViewBlock;

export function createScrollView(scrollbarStyle: Style): ScrollView {
  const getState = tui.createLocalStates<ScrollViewState>(() => {
    const offset = signal(0);
    const blockHeight = signal(0);
    const childrenHeight = signal(0);

    const scrollbar = computed([offset, blockHeight, childrenHeight], (offset, blockHeight, childrenHeight) => {
      if (blockHeight === 0 || childrenHeight === 0) {
        return "";
      }

      const heightDiff = childrenHeight - blockHeight;
      if (heightDiff <= 0) {
        return "";
      }

      const thumbHeight = Math.floor(blockHeight * (blockHeight / childrenHeight));
      const remainingTrackHeight = blockHeight - thumbHeight;
      const bottomTrackHeight = remainingTrackHeight - Math.ceil(offset * (blockHeight / childrenHeight));
      const topTrackHeight = remainingTrackHeight - bottomTrackHeight;

      const topTrack = stripe(scrollbarStyle.string(" "), topTrackHeight, "vertical");
      const thumb = stripe(scrollbarStyle.string("┃"), thumbHeight, "vertical");
      const bottomTrack = stripe(scrollbarStyle.string(" "), bottomTrackHeight, "vertical");

      return `${topTrack ? topTrack + "\n" : ""}${thumb}\n${bottomTrack}`;
    });

    return {
      block: undefined!,
      blockHeight,
      childrenHeight,
      offset,
      scrollbar,
    };
  });

  function ScrollView(
    options: ScrollViewOptions,
    ...childrenSignals: MaybeSignal<Block>[]
  ): ScrollViewBlock {
    const state = getState(options.id);

    state.block ??= new HorizontalBlock(
      {
        id: options.id,
        width: options.width,
        height: options.height,
        string: options.string,
      },
      new VerticalBlock(
        {
          width: computed([state.scrollbar], (scrollbar) => scrollbar ? calc("100% - 2") : "100%"),
          height: "100%",
          y: computed([state.offset], (offset) => -offset),
          x: options.x,
          gap: options.gap,
          string: options.string,
        },
        ...childrenSignals,
      ),
      scrollbarStyle.create(state.scrollbar),
    ) as ScrollViewBlock;

    state.associateBlock(state.block);

    state.addEventListener("mouse", (mouseEvent) => {
      if (!("scroll" in mouseEvent)) return;
      if (!intersects(mouseEvent.x, mouseEvent.y, state.block.boundingRectangle())) return;

      const scrollOffset = (mouseEvent.scroll! * 2) - 1;
      const heightDiff = state.childrenHeight.get() - state.blockHeight.get();
      state.offset.modify((v) => Math.max(0, Math.min(heightDiff, v + scrollOffset)));
    });

    const updateSizes = () => {
      const blockHeight = state.block.computedHeight;
      state.blockHeight.set(blockHeight);

      const [view] = state.block.children!;
      let childrenHeight = 0;
      for (const children of view.children) {
        childrenHeight += children.computedHeight;
        if (childrenHeight < blockHeight) {
          childrenHeight += view.computedGap;
        }
      }
      state.childrenHeight.set(childrenHeight);

      // Adjust state offset after resize so the same items are visible
      const heightDiff = childrenHeight - blockHeight;
      state.offset.modify((v) => Math.max(0, Math.min(heightDiff + 1, v)));
    };

    state.block.addEventListener("resize", updateSizes);

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
