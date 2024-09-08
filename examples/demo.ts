import { VerticalBlock } from "@tui/nice/layout";
import { tui } from "../src/tui.ts";
import { Button, ScrollView, Spinner, Suspense, TextBox } from "../src/components/mod.ts";
import { HorizontalBlock } from "@tui/nice/layout/horizontal";

tui.render(() =>
  new VerticalBlock(
    { width: "100%", height: "100%" },
    // Buttons
    Button("abc"),
    Button("xyz"),
    // TextBoxes
    TextBox("Textbox"),
    TextBox("Multiline textbox", {
      multiline: true,
    }),
    // ScrollView
    ScrollView(
      { id: "scroll-view", height: "100%", width: 30 },
      Button("abc"),
      Button("xyz"),
      Button("abc"),
      Button("xyz"),
      Button("abc"),
      Button("xyz"),
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
  )
);
