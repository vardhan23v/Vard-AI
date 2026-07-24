import { test } from "@playwright/test";
test("dbg", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForTimeout(1500);
  const count = await page.getByTestId("dnd-drop").count();
  const containers = await page.getByTestId("dnd-container").count();
  console.log("drop btns:", count, "containers:", containers);
  if (count > 0) {
    await page.getByTestId("dnd-drop").first().click();
    await page.waitForTimeout(300);
    const slot = await page.getByTestId("dnd-container").first().getAttribute("data-slot-active");
    console.log("slot after click:", slot);
  }
});
