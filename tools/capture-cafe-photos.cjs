// Captures a few first-person screenshots of each cafe walk for the shortlist cards (local files, not committed).
// usage: SITE_PHOTO_DIR=... node tools/capture-cafe-photos.cjs   (web app must be running on :3000)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "/tmp/pw/node_modules/playwright-core");
const fs = require("fs"), path = require("path");
const OUT = process.env.SITE_PHOTO_DIR || path.join(process.env.HOME, "code/hackprinceton/data/derived/site-photos");
const IDS = (process.env.CAFE_SCANS || "w2JcUVybv9c,xVKH13z5MJ8,JAnuRsaVo9M").split(",");
(async () => {
  const b = await chromium.launch({ executablePath: "/snap/bin/chromium", headless: true, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const id of IDS) {
    const dir = path.join(OUT, `scan-${id}`); fs.mkdirSync(dir, { recursive: true });
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(`http://127.0.0.1:3000/walk3d/walk.html?model=${id}`, { waitUntil: "load" });
    await p.waitForTimeout(25000);
    // dismiss the offer card if present so it is not in the picture
    await p.getByRole("button", { name: /Keep the scan/ }).click({ timeout: 2000 }).catch(() => {});
    await p.evaluate(() => { // hide every overlay (help, buttons, cards, labels); keep the 3D canvas
      const cv = document.querySelector("canvas");
      document.querySelectorAll("body *").forEach((el) => { if (el !== cv && !el.contains(cv) && !cv.contains(el) && getComputedStyle(el).position !== "static") el.style.visibility = "hidden"; });
    });
    for (let n = 1; n <= 4; n++) {
      await p.waitForTimeout(2500);
      await p.locator("canvas").first().screenshot({ path: path.join(dir, `photo-${n}.jpg`), type: "jpeg", quality: 85 });
      await p.keyboard.press("n"); // next scan spot
    }
    console.log(id, "ok");
    await p.close();
  }
  await b.close();
})().catch((e) => { console.log("FAILED", e.message.slice(0, 200)); process.exit(1); });
