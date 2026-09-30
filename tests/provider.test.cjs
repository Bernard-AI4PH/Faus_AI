const { test } = require("node:test");
const assert = require("node:assert/strict");
const { endpoint, payload, chunks } = require("../build-electron/provider.js");
test("credentials require encrypted remote transport", () => {
  assert.throws(() => endpoint("http://example.com/v1"));
  assert.throws(() => endpoint("https://user:secret@example.com"));
  assert.throws(() => endpoint("file:///etc/passwd"));
  assert.equal(endpoint("http://127.0.0.1:11434/"), "http://127.0.0.1:11434");
});
test("image is attached only to latest question in each provider format", () => {
  const messages = [
    { role: "user", content: "before" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "now" },
  ];
  const image = "data:image/png;base64,YWJj";
  const local = payload(
    { provider: "ollama", model: "vision" },
    messages,
    image,
  );
  assert.equal(local.messages[1].images, undefined);
  assert.deepEqual(local.messages[3].images, ["YWJj"]);
  const api = payload({ provider: "api", model: "vision" }, messages, image);
  assert.equal(api.messages[1].content, "before");
  assert.equal(api.messages[3].content[1].image_url.url, image);
});
function response(parts) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const part of parts) c.enqueue(encoder.encode(part));
        c.close();
      },
    }),
  );
}
test("Ollama stream handles fragmented lines and final unterminated data", async () => {
  let result = "";
  for await (const t of chunks(
    response([
      '{"message":{"content":"hel',
      'lo"}}\n{"message":{"content":" world"}}',
    ]),
    "ollama",
  ))
    result += t;
  assert.equal(result, "hello world");
});
test("compatible API SSE ignores metadata and completion markers", async () => {
  let result = "";
  for await (const t of chunks(
    response([
      ': keepalive\nevent: message\ndata: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\ndata: [DONE]\n',
    ]),
    "api",
  ))
    result += t;
  assert.equal(result, "Hello");
});
test("stream errors are surfaced", async () => {
  await assert.rejects(async () => {
    for await (const t of chunks(
      response(['{"error":"model does not support images"}\n']),
      "ollama",
    )) {
    }
  }, /does not support images/);
});
