import { VerticalBlock } from "@tui/nice/layout";
import { tui } from "../src/tui.ts";
import { Button, ScrollView, Spinner, Suspense, TextBox } from "../src/components/mod.ts";
import { HorizontalBlock } from "@tui/nice/layout/horizontal";
import { colors } from "../src/components/colors.ts";
import { crayon } from "@crayon/crayon";
import { Style } from "../../nice/src/style_block.ts";
import { createBlockButton } from "../src/components/BlockButton.ts";

const block = new Style({
  string: crayon.bgRed,
  padding: { y: 1, right: 2 },
});
const edge = block.derive({
  border: {
    left: true,
    style: crayon.bgRed.bold,
    type: "thick",
  },
});

const BlockButton = createBlockButton((id, state) => {
  if (state === "active") {
    return new HorizontalBlock(
      {},
      edge.create("", { string: crayon.bgBlue, border: { style: crayon.bgBlue } }),
      block.create(id, { string: crayon.bgBlue }),
    );
  }

  if (state === "hover") {
    return new HorizontalBlock(
      {},
      edge.create("", { string: crayon.bgYellow, border: { style: crayon.bgYellow } }),
      block.create(id, { string: crayon.bgYellow }),
    );
  }

  return new HorizontalBlock(
    {},
    edge.create(""),
    block.create(id),
  );
});

tui.render(() =>
  new VerticalBlock(
    { width: "100%", height: "100%", string: crayon.bgHex(colors.background) },
    // Buttons
    Button("abc"),
    Button("xyz"),
    // TextBoxes
    TextBox("Textbox"),
    TextBox("Multiline textbox", {
      multiline: true,
    }),
    BlockButton("BlockButton"),
    new HorizontalBlock(
      { height: "20%", width: "100%", gap: 4 },
      // ScrollView
      ScrollView(
        { id: "scroll-view", height: 5, width: 30 },
        Button("abc"),
        Button("def"),
        Button("ghi"),
        Button("jkl"),
        Button("zxc"),
        Button("vbn"),
        Button("mlp"),
      ),
      // Suspense
      new HorizontalBlock(
        { gap: 4 },
        Suspense("3s", async () => {
          await new Promise((r) => setTimeout(r, 3000));
          return Button("Loaded after 3s!");
        }, Spinner("Waiting 3 seconds")),
        Suspense(
          "5s",
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(Button("Loaded after 5s!"));
            }, 5000);
          }),
          Spinner("Waiting 5 seconds"),
        ),
      ),
    ),
  )
);
