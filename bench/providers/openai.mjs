/* =========================================================================
   Minimal OpenAI-compatible streaming client for the benchmark.
   -------------------------------------------------------------------------
   Works with OpenAI, DeepSeek, Qwen/DashScope compatible endpoints, vLLM,
   Ollama's /v1 surface, etc. The runner only needs text deltas and tool-call
   argument deltas; everything else is ignored.
   ========================================================================= */

const DEFAULT_TIMEOUT_MS = 120_000;

function endpoint(baseUrl) {
  const base = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

function textFromMessage(message) {
  if (!message || typeof message !== "object") return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

/**
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {string} [options.apiKey]
 * @param {string} options.model
 * @param {string} options.system
 * @param {string} options.prompt
 * @param {"fence"|"tool"} options.mode
 * @param {object} [options.tool]
 * @param {"auto"|"required"|"none"} [options.toolChoice]
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {number} [options.timeoutMs]
 * @returns {AsyncGenerator<{type:"text", text:string}|{type:"tool", index:number, name?:string, args?:string}>}
 */
export async function* streamOpenAI(options) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const body = {
    model: options.model,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.prompt },
    ],
    stream: true,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 2400,
  };
  if (options.mode === "tool" && options.tool) {
    body.tools = [options.tool];
    body.tool_choice =
      options.toolChoice === "required"
        ? { type: "function", function: { name: options.tool.function.name } }
        : options.toolChoice === "none"
          ? "none"
          : "auto";
  }

  const headers = { "content-type": "application/json" };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

  let response;
  try {
    response = await fetch(endpoint(options.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = error?.name === "AbortError" ? "request timed out" : error?.message ?? String(error);
    throw new Error(`request failed: ${message}`);
  }

  if (!response.ok) {
    clearTimeout(timeout);
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 1200);
    } catch {
      // ignore
    }
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    // Some local gateways ignore stream:true and return one JSON document.
    const json = await response.json();
    const message = json?.choices?.[0]?.message;
    const text = textFromMessage(message);
    if (text) yield { type: "text", text };
    const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    for (const [index, call] of calls.entries()) {
      yield {
        type: "tool",
        index,
        name: call?.function?.name,
        args: call?.function?.arguments ?? "",
      };
    }
    clearTimeout(timeout);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleEvent = function* (block) {
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = payload?.choices?.[0];
      const delta = choice?.delta;
      if (!delta) continue;
      const text = textFromMessage(delta);
      if (text) yield { type: "text", text };
      const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const [position, call] of calls.entries()) {
        yield {
          type: "tool",
          index: Number.isInteger(call?.index) ? call.index : position,
          name: call?.function?.name,
          args: call?.function?.arguments,
        };
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        yield* handleEvent(block);
      }
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim()) yield* handleEvent(buffer);
  } finally {
    clearTimeout(timeout);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
