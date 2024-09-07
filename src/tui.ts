import { decodeBuffer, type KeyPress, type MousePress } from "@tui/inputs";
import type { Block } from "@tui/nice";

import { AnsiDiffer } from "./diff.ts";
import { BaseSignal, computed, type MaybeSignal, observableObject } from "@tui/signals";

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
}

export type UpdateListener = () => void;
export type MouseListener = (mousePress: MousePress) => void;
export type KeyListener = (keyPress: KeyPress) => void;

export type EventListener = UpdateListener | MouseListener | KeyListener;

export type TuiEvent = "key" | "mouse" | "update";

export type Sanitizer = () => void | PromiseLike<void>;

export type PreparedState<T> = T & {
  focus(): void;
  unfocus(): void;
  isFocused(): boolean;

  associateBlock(block: MaybeSignal<Block>): void;

  alive: boolean;
  kill(): void;

  addEventListener(event: "key", listener: KeyListener): void;
  addEventListener(event: "mouse", listener: MouseListener): void;
  addEventListener(event: "update", listener: UpdateListener): void;
};

const textEncoder = new TextEncoder();
const writer = Deno.stdout.writable.getWriter();

interface TuiGlobalState {
  focus: unknown;
}

export class Tui {
  #componentBlock?: Block;

  #differ = new AnsiDiffer();

  #drawTimeout: number | undefined;

  eventListeners: EventListeners = {
    key: [],
    mouse: [],
    update: [],
  };

  sanitizers: Sanitizer[] = [];

  exit = false;

  constructor() {}

  #globalState: TuiGlobalState = { focus: 0 };
  get globalState(): TuiGlobalState {
    return this.#globalState;
  }

  createLocalStates<T extends object>(base: (id: string) => T): (id: string) => PreparedState<T> {
    const states: { [id: string]: PreparedState<T>[] } = {};

    const prepare = (id: string, stateObj: T): PreparedState<T> => {
      const eventListeners: [TuiEvent, EventListener][] = [];

      const prepared = Object.assign(stateObj, {
        focus: () => {
          this.#globalState.focus = stateObj;
        },
        unfocus: () => {
          this.#globalState.focus = -1;
        },
        isFocused: () => {
          return this.#globalState.focus === stateObj;
        },

        associateBlock: (block: MaybeSignal<Block>) => {
          if (block instanceof BaseSignal) {
            computed([block], (block) => {
              block.addEventListener("unmount", () => {
                prepared.kill();
              });
            });
          } else {
            block.addEventListener("unmount", () => {
              prepared.kill();
            });
          }
        },

        alive: true,
        blocked: false,
        kill: () => {
          prepared.alive = false;

          for (const [event, listener] of eventListeners.splice(0)) {
            this.removeEventListener(event, listener);
          }

          const index = states[id]?.findIndex((obj) => obj === stateObj);
          if (typeof index !== "number" || index === -1) return;

          states[id]!.splice(index, 1);
        },

        addEventListener: (event: TuiEvent, listener: EventListener) => {
          eventListeners.push([event, listener]);

          this.addEventListener(
            event as "key" & "mouse" & "update",
            listener,
          );
        },
      });

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
  addEventListener(event: "update", listener: UpdateListener): void;
  addEventListener(event: TuiEvent, listener: EventListener): void {
    this.eventListeners[event].push(
      listener as
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
    // Debounce render
    clearTimeout(this.#drawTimeout);
    this.#drawTimeout = setTimeout(this.#draw, 8);
    const { columns, rows } = Deno.consoleSize();
    this.#consoleSize.columns = columns;
    this.#consoleSize.rows = rows;
    // TODO: use observable in differ from the start?
    this.#differ.updateSize(this.#consoleSize);
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
      // setRaw sometimes crashes with bad resource ID if it fires at wrong time
      try {
        Deno.stdin.setRaw(false);
      } catch { /**/ }

      await writer.write(
        textEncoder.encode(SHOW_CURSOR + DISABLE_MOUSE + USE_PRIMARY_BUFFER),
      );
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
          // FIXME: tab controls
          // if (keyPress.shift) {
          //     let lastId = this.#globalState.focus - 1;
          //     if (lastId < 0) lastId = this.#states.length + lastId;
          //     this.#globalState.focus = lastId;
          // } else {
          //     this.#globalState.focus = (this.#globalState.focus + 1) % this.#states.length;
          // }
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
