import { type Signal, signal } from "@tui/signals";
import type { Block } from "@tui/nice";

import { tui } from "../tui.ts";

interface SuspenseState {
  block: Signal<Block>;
}

const getState = tui.createLocalStates<SuspenseState>(() => ({
  block: signal(undefined!),
}));

export function Suspense(
  id: string,
  component: Promise<Block> | (() => Promise<Block>),
  fallback: Block,
): Signal<Block> {
  const state = getState(id);

  state.block.set(fallback);
  state.associateBlock(state.block);

  if (typeof component === "function") {
    component().then((block) => state.block.set(block));
  } else {
    component.then((block) => state.block.set(block));
  }

  return state.block;
}