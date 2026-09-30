delete process.env.ELECTRON_RUN_AS_NODE;
const { _electron: electron } = require("@playwright/test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/api/tags") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          models: [{ name: "test-vision" }, { name: "test-reasoning" }],
        }),
      );
    }
    if (req.url === "/api/chat") {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push(JSON.parse(body));
      res.setHeader("Content-Type", "application/x-ndjson");
      res.write(
        JSON.stringify({ message: { content: "The integration test " } }) +
          "\n",
      );
      setTimeout(
        () =>
          res.end(
            JSON.stringify({ message: { content: "passed." }, done: true }) +
              "\n",
          ),
        100,
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "faus-test-"));
  let app;
  try {
    app = await electron.launch({
      executablePath: process.env.FAUS_EXECUTABLE || undefined,
      args: [
        ...(process.env.FAUS_EXECUTABLE ? [] : ["."]),
        `--user-data-dir=${userData}`,
      ],
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Empty conversation").waitFor();
    assert.equal(await page.evaluate(() => typeof window.faus), "object");
    await page.screenshot({ path: "release/preview.png" });
    await page
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await page
      .getByLabel("Server URL")
      .fill(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("button", { name: "Discover models" }).click();
    await page.getByLabel("Discovered models").selectOption("test-vision");
    await page.getByRole("button", { name: "Save connection" }).click();
    await page
      .getByRole("button", { name: "Select model", exact: true })
      .click();
    await page
      .getByRole("button", { name: "test-reasoning", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator(".titlebar")
        .evaluate((el) => el.getBoundingClientRect().top),
      0,
    );
    await page.screenshot({ path: "release/model-selector.png" });
    await page.getByLabel("Search models").fill("reasoning");
    assert.equal(
      await page
        .getByRole("button", { name: "test-vision", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "test-reasoning", exact: true })
      .click();
    assert.equal(
      await page.evaluate(async () => (await window.faus.settings()).model),
      "test-reasoning",
    );
    await page.getByLabel("Message FAUS_AI").fill("Test this connection");
    await page.getByRole("button", { name: "Send message" }).click();
    await page
      .getByText("The integration test passed.", { exact: true })
      .waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].model, "test-reasoning");
    assert.equal(requests[0].messages.at(-1).content, "Test this connection");
    await page.getByRole("button", { name: "Keep window on top" }).click();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
      ),
      true,
    );
    await page.getByRole("button", { name: "New chat", exact: true }).click();
    await page.getByLabel("Empty conversation").waitFor();
    await page.setViewportSize({ width: 390, height: 580 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: "release/compact-preview.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: Electron preload, model discovery, model search/switch/persistence, settings, streamed chat, pinning, new chat; no renderer errors.",
    );
  } finally {
    if (app) await app.close();
    server.close();
    await fs.rm(userData, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
