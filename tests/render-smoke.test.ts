import { describe, expect, it } from "bun:test";
import { Box, Text } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";

describe("OpenTUI render smoke", () => {
  it("can replace root children without calling a nonexistent clear()", async () => {
    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 40,
      height: 8,
    });

    renderer.root.add(Box({ width: "100%" }, Text({ content: "first" })));

    for (const child of [...renderer.root.getChildren()]) {
      renderer.root.remove(child.id);
    }

    renderer.root.add(Box({ width: "100%" }, Text({ content: "second" })));
    renderer.requestRender();
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame.includes("second")).toBe(true);
    expect(frame.includes("first")).toBe(false);

    renderer.destroy();
  });
});
