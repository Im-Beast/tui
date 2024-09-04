import { loopAnsi } from "@tui/strings/ansi_looping";

export interface ConsoleSize {
  columns: number;
  rows: number;
}

export class AnsiDiffer {
  previousBufferMap?: string[][];

  columns = 0;
  rows = 0;

  constructor() {
    const { columns, rows } = Deno.consoleSize();
    this.columns = columns;
    this.rows = rows;
  }

  updateSize({ columns, rows }: ConsoleSize) {
    this.columns = columns;
    this.rows = rows;
    this.previousBufferMap = undefined;
  }

  diff(current: string): string {
    const bufferMap: string[][] = [];

    let column = 1;
    let row = 1;
    let lastStyle = "";
    loopAnsi(current, (char, style) => {
      if (char === "\n") {
        column = 1;
        row += 1;
        return;
      }

      if (style === "\x1b[0m") {
        lastStyle = "";
        return;
      }

      if (style) {
        lastStyle += style;
        return;
      }

      bufferMap[row] ??= [];
      // TODO: optimize style
      bufferMap[row]![column] = lastStyle + char;

      column += 1;
    });

    const { previousBufferMap, columns, rows } = this;
    if (!previousBufferMap) {
      this.previousBufferMap = bufferMap;
      return current;
    }

    column = Math.min(column, columns);
    row = Math.min(row, rows);

    let diff = "";

    let lastRow = 0;
    let lastCol = 0;
    for (let r = 1; r <= row; ++r) {
      const curRow = bufferMap[r]!;
      const previousRow = previousBufferMap[r];

      if (!curRow) continue;

      if (!previousRow) {
        diff += `\x1b[${r};1H` + curRow.join("");
        continue;
      }

      for (let c = 1; c <= column; ++c) {
        const curCol = curRow[c];
        const oldCol = previousRow[c];

        if (curCol && oldCol !== curCol) {
          if (lastCol === c + 1 && lastRow === r) {
            diff += curCol;
          } else {
            diff += `\x1b[0m\x1b[${r};${c}H` + curCol;
          }

          lastCol = c;
          lastRow = r;
        }
      }

      diff += "\x1b[0m";
    }

    // TODO: the same for columns
    if (row < rows && previousBufferMap.length > row) {
      diff += `\x1b[${row + 1};${0}H\x1b[0m\x1b[0J`;
    }

    this.previousBufferMap = bufferMap;
    return diff;
  }
}
