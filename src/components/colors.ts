import { crayon } from "@crayon/crayon";
import { getColorSupport } from "@crayon/color-support";

crayon.colorSupport = await getColorSupport();

// TODO: Support dynamic color scheme changes
export const colors = {
    background: 0x000000,
    backgroundHigher: 0x363636,
    backgroundHighest: 0x545454,

    textLowest: 0x808080,
    textLower: 0xC0C0C0,
    text: 0xFFFFFF,
    textHigher: 0xFFFFFF,
    textHighest: 0xFFFFFF,

    accent: 0x0060FF,
    accentHigher: 0x0020AF,
    accentHighest: 0x0080CF,
};
