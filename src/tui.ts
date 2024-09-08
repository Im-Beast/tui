import { decodeBuffer, type KeyPress, type MousePress } from "@tui/inputs";
import type { Block } from "@tui/nice";

import { AnsiDiffer, ConsoleSize } from "./diff.ts";
import { BaseSignal, computed, getValue, type MaybeSignal, observableObject } from "@tui/signals";

const ENABLE_MOUSE = "\x1b[?9h\x1b[?1005h\x1b[?1003h";
const DISABLE_MOUSE = "\x1b[?9l\x1b[?1005l\x1b[?1003l";
const HIDE_CURSOR = `\x1b[?25l`;
const SHOW_CURSOR = `\x1b[?25h`;
const USE_SECONDARY_BUFFER = "\x1b[?1049h";
const USE_PRIMARY_BUFFER = "\x1b[?1049l";

export type TuiComponent = () => Block | PromiseLike<Block>;

interface EventListeners {
  key: KeyListener[];
  mouse: MouseListener[];
  update: UpdateListener[];
  resize: ResizeListener[];
}

export type UpdateListener = () => void;
export type ResizeListener = (size: ConsoleSize) => void;
export type MouseListener = (mousePress: MousePress) => void;
export type KeyListener = (keyPress: KeyPress) => void;

export type EventListener = UpdateListener | MouseListener | KeyListener | ResizeListener;

export type TuiEvent = "key" | "mouse" | "update" | "resize";

export type Sanitizer = () => void | PromiseLike<void>;

export type PreparedState<T> = T & {
  id: string;

  focus(): void;
  unfocus(): void;
  isFocused(): boolean;

  associatedBlocks: MaybeSignal<Block>[];
  associateBlock(block: MaybeSignal<Block>): void;

  alive: boolean;
  kill(): void;

  eventListeners: [TuiEvent, EventListener][];
  addEventListener(event: "key", listener: KeyListener): void;
  addEventListener(event: "mouse", listener: MouseListener): void;
  addEventListener(event: "update", listener: UpdateListener): void;
  addEventListener(event: "resize", listener: ResizeListener): void;
};

const textEncoder = new TextEncoder();
const writer = Deno.stdout.writable.getWriter();

interface TuiGlobalState {
  stateObjects: PreparedState<unknown>[];
  focusIndex: number;
}

export class Tui {
  #componentBlock?: Block;
  #differ = new AnsiDiffer();
  #drawTimeout: number | undefined;

  readonly globalState: TuiGlobalState = {
    stateObjects: [],
    focusIndex: 0,
  };

  eventListeners: EventListeners = {
    key: [],
    mouse: [],
    update: [],
    resize: [],
  };

  sanitizers: Sanitizer[] = [];

  exit = false;

  constructor() {}

  createLocalStates<T extends object>(base: (id: string) => T): (id: string) => PreparedState<T> {
    const states: { [id: string]: PreparedState<T>[] } = {};

    const prepare = (id: string, stateObj: T): PreparedState<T> => {
      const { globalState } = this;

      const prepared = Object.assign(stateObj, {
        id,

        focus: () => {
          globalState.focusIndex = globalState.stateObjects.indexOf(prepared);
        },
        unfocus: () => {
          globalState.focusIndex = -1;
        },
        isFocused: () => {
          const { focusIndex, stateObjects } = this.globalState;
          const focusedObj = stateObjects[focusIndex];
          return focusedObj === stateObj;
        },

        associatedBlocks: [] as MaybeSignal<Block>[],
        associateBlock: (block: MaybeSignal<Block>) => {
          prepared.associatedBlocks.push(block);
          if (block instanceof BaseSignal) {
            computed([block], (block) => {
              block.addEventListener("unmount", () => prepared.kill());
            });
          } else {
            block.addEventListener("unmount", () => prepared.kill());
          }
        },

        alive: true,
        blocked: false,
        kill: () => {
          prepared.alive = false;

          for (const block of prepared.associatedBlocks.splice(0)) {
            getValue(block)?.unmount();
          }

          for (const [event, listener] of prepared.eventListeners.splice(0)) {
            // @ts-ignore its the same type signature
            this.removeEventListener(event, listener);
          }

          const globalIndex = globalState.stateObjects.indexOf(prepared);
          if (globalIndex !== -1) {
            if (globalState.focusIndex === globalIndex) {
              globalState.focusIndex -= 1;
            }
            globalState.stateObjects.splice(globalIndex, 1);
          }

          const localIndex = states[id]?.findIndex((obj) => obj === stateObj);
          if (typeof localIndex !== "number" || localIndex === -1) return;

          states[id]!.splice(localIndex, 1);
        },

        eventListeners: [] as [TuiEvent, EventListener][],
        addEventListener: (event: TuiEvent, listener: EventListener) => {
          prepared.eventListeners.push([event, listener]);
          // @ts-ignore its the same type signature
          this.addEventListener(event, listener);
        },
      });

      this.globalState.stateObjects.push(prepared);

      return prepared;
    };

    return function getState(id: string): PreparedState<T> {
      const localStates = states[id] ??= [];

      const stateObj = prepare(id, base(id));
      localStates.push(stateObj);
      return stateObj;
    };
  }

  addSanitizer(sanitizer: () => void): void {
    this.sanitizers.push(sanitizer);
  }

  async close() {
    this.exit = true;
    for (const sanitizer of this.sanitizers) {
      await sanitizer();
    }
  }

  addEventListener(event: "key", listener: KeyListener): void;
  addEventListener(event: "mouse", listener: MouseListener): void;
  addEventListener(event: "resize", listener: ResizeListener): void;
  addEventListener(event: "update", listener: UpdateListener): void;
  addEventListener(event: TuiEvent, listener: EventListener): void {
    this.eventListeners[event].push(
      listener as
        & ResizeListener
        & KeyListener
        & MouseListener
        & UpdateListener,
    );
  }

  removeEventListener(
    event: TuiEvent,
    listener: KeyListener | MouseListener | UpdateListener,
  ): boolean {
    const listeners = this
      .eventListeners[event] as (
        | KeyListener
        | MouseListener
        | UpdateListener
      )[];
    const index = listeners.indexOf(listener);
    if (index === -1) return false;
    listeners.splice(index, 1);
    return true;
  }

  #draw = async () => {
    const buffer = this.#componentBlock!.render();

    for (const listener of this.eventListeners.update) {
      listener();
    }

    // TODO: make diffStrings produce better output
    const diff = this.#differ.diff(buffer);
    await writer.write(textEncoder.encode("\x1b[1;1H" + diff));

    if (!this.exit) {
      this.#drawTimeout = setTimeout(this.#draw, 16);
    }
  };

  #consoleSize = observableObject(Deno.consoleSize());
  #move = () => {
    const consoleSize = this.#consoleSize;

    // Debounce render
    clearTimeout(this.#drawTimeout);
    this.#drawTimeout = setTimeout(this.#draw, 8);
    const { columns, rows } = Deno.consoleSize();
    consoleSize.columns = columns;
    consoleSize.rows = rows;
    // TODO: use observable in differ from the start?
    this.#differ.updateSize(consoleSize);

    for (const listener of this.eventListeners.resize) {
      listener(consoleSize);
    }
  };

  async render(component: TuiComponent): Promise<void> {
    this.addSanitizer(() => {
      Deno.removeSignalListener("SIGWINCH", this.#move);
      clearTimeout(this.#drawTimeout);
      this.exit = true;
    });

    Deno.addSignalListener("SIGWINCH", this.#move);

    this.#componentBlock = await component();

    await Promise.all([
      this.handleInputs(),
      this.#draw(),
    ]);

    await this.close();
  }

  async handleInputs(): Promise<void> {
    this.addSanitizer(async () => {
      await writer.write(
        textEncoder.encode(SHOW_CURSOR + DISABLE_MOUSE + USE_PRIMARY_BUFFER),
      );
      writer.releaseLock();

      // setRaw sometimes crashes with bad resource ID if it fires at wrong time
      try {
        Deno.stdin.setRaw(false);
      } catch { /**/ }
    });

    await writer.write(
      textEncoder.encode(
        USE_SECONDARY_BUFFER + HIDE_CURSOR + ENABLE_MOUSE + "\x1b[1;1H",
      ),
    );
    Deno.stdin.setRaw(true);

    for await (const chunk of Deno.stdin.readable) {
      const decoded = decodeBuffer(chunk);
      if (decoded[0].key === "c" && decoded[0].ctrl) {
        this.exit = true;
        break;
      }

      for (const keyPress of decoded) {
        if (keyPress.key === "tab") {
          let { focusIndex, stateObjects } = this.globalState;

          let object: Block | undefined;
          // Temporary workaround
          // Some objects which don't have root still persist
          // But they are not being computed
          // This ensures only visible item can be focused
          while (!object?.computedWidth || !object?.visible) {
            if (keyPress.shift) {
              focusIndex = focusIndex - 1;
              if (focusIndex < 0) {
                focusIndex = stateObjects.length + focusIndex;
              }
            } else {
              focusIndex = (focusIndex + 1) % stateObjects.length;
            }

            const stateObj = stateObjects[focusIndex];
            if (!stateObj) break;
            object = getValue(stateObj?.associatedBlocks?.[0]);
          }

          this.globalState.focusIndex = focusIndex;
          continue;
        }

        if (keyPress.key === "mouse") {
          for (const listener of this.eventListeners.mouse) {
            listener(keyPress as MousePress);
          }
          continue;
        }

        for (const listener of this.eventListeners.key) {
          listener(keyPress);
        }
      }
    }
  }
}

export const tui: Tui = new Tui();
