import { decodeBuffer, KeyPress, MousePress } from "@tui/inputs";
import { Block } from "@tui/nice";

import { AnsiDiffer } from "./diff.ts";
import { BaseSignal, getValue, MaybeSignal, observableObject, Signal, signal } from "@tui/signals";

const ENABLE_MOUSE = "\x1b[?9h\x1b[?1005h\x1b[?1003h";
const DISABLE_MOUSE = "\x1b[?9l\x1b[?1005lx1b[?1003l";
const HIDE_CURSOR = `\x1b[?25l`;
const SHOW_CURSOR = `\x1b[?25h`;
const USE_SECONDARY_BUFFER = "\x1b[?1049h";
const USE_PRIMARY_BUFFER = "\x1b[?1049l";

export type TuiComponent = () => MaybeSignal<Block | PromiseLike<Block>>;

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

const textEncoder = new TextEncoder();
const writer = Deno.stdout.writable.getWriter();

interface TuiGlobalState {
    focus: unknown;
}

export class Tui {
    #differ = new AnsiDiffer();

    #component?: TuiComponent;
    #componentBlock?: Block;

    #drawTimeout: number | undefined;

    eventListeners: EventListeners = {
        key: [],
        mouse: [],
        update: [],
    };

    sanitizers: Sanitizer[] = [];

    exit = false;

    constructor() {}

    // TODO: trackStates(): TuiState[]
    // { using states = trackStates(); somethingThatMakesStates(); console.log(states) }

    #globalState: TuiGlobalState = { focus: 0 };
    get globalState(): TuiGlobalState {
        return this.#globalState;
    }

    createLocalStates<T extends object>(base: (id: string) => T) {
        type PreparedT = T & {
            focus(): void;
            unfocus(): void;
            isFocused(): boolean;

            alive: boolean;
            kill(): void;

            addEventListener(event: "key", listener: KeyListener): void;
            addEventListener(event: "mouse", listener: MouseListener): void;
            addEventListener(event: "update", listener: UpdateListener): void;
        };

        const states: { [id: string]: [Signal<number>, PreparedT[]] } = {};

        this.addEventListener("update", () => {
            for (const [cursor] of Object.values(states)) {
                cursor.set(0);
            }
        });

        const prepare = (id: string, stateObj: T): PreparedT => {
            const eventListeners: [TuiEvent, EventListener][] = [];

            if ("block" in stateObj && stateObj.block instanceof Block) {
                stateObj.block.addEventListener("unmount", () => {
                    prepared.kill();
                });
            }

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

                alive: true,
                kill: () => {
                    prepared.alive = false;

                    for (const [event, listener] of eventListeners.splice(0)) {
                        this.removeEventListener(event, listener);
                    }

                    const index = states[id]?.[1]?.findIndex((obj) => obj === stateObj);
                    if (typeof index !== "number" || index === -1) return;

                    // states[id]![0].set(0);
                    states[id]![1]!.splice(index, 1);
                },

                addEventListener: (
                    event: TuiEvent,
                    listener: EventListener,
                ) => {
                    eventListeners.push([event, listener]);
                    this.addEventListener(
                        event as "key" & "mouse" & "update",
                        listener,
                    );
                },
            });

            return prepared;
        };

        return function getState(id: string): PreparedT {
            const [cursor, localStates] = states[id] ??= [signal(0), []];

            const activeSignal = BaseSignal.activeSignal;
            BaseSignal.activeSignal = undefined;

            const localState = localStates[cursor.get()];
            cursor.modify((cursor) => ++cursor);

            BaseSignal.activeSignal = activeSignal;

            if (!localState) {
                const stateObj = prepare(id, base(id));
                localStates.push(stateObj);
                return stateObj;
            }

            return localState;
        };
    }

    getBlockState = this.createLocalStates<{ block?: MaybeSignal<Block> }>(
        () => ({ block: undefined }),
    );
    memoBlock(id: string, block: () => MaybeSignal<Block>) {
        return (this.getBlockState(id).block ??= block());
    }

    addSanitizer(sanitizer: () => void): void {
        this.sanitizers.push(sanitizer);
    }

    async close() {
        this.exit = true;
        for (const sanitizer of this.sanitizers.splice(0)) {
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

    async updateComponent(): Promise<void> {
        if (!this.#component) return;
        this.#componentBlock = await getValue(this.#component());
    }

    async render(component: TuiComponent): Promise<void> {
        this.addSanitizer(() => {
            Deno.removeSignalListener("SIGWINCH", this.#move);
            clearTimeout(this.#drawTimeout);
            this.exit = true;
        });

        Deno.addSignalListener("SIGWINCH", this.#move);

        this.#component = component;

        await this.updateComponent();

        await Promise.all([
            this.handleInputs(),
            this.#draw(),
        ]);

        await this.close();
    }

    async handleInputs(): Promise<void> {
        this.addSanitizer(() => {
            // FIXME: setraw
            // Deno.stdin.setRaw(false);
            console.log(SHOW_CURSOR + DISABLE_MOUSE + USE_PRIMARY_BUFFER);
        });

        await Deno.stdout.write(
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

export const tui = new Tui();
