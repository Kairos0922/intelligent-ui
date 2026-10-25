/* =========================================================================
   Stream transport
   -------------------------------------------------------------------------
   `connect()` accepts the shapes a host is likely to have:

     await ui.connect("/api/chat/stream")          // NDJSON or SSE endpoint
     await ui.connect(await fetch(...))            // Response
     await ui.connect(res.body!)                   // ReadableStream
     await ui.connect(chatStream())                // AsyncIterable<string>

   NDJSON bytes are forwarded to the compiler untouched (it owns line
   buffering). SSE `data:` payloads are unwrapped: raw NDJSON lines,
   `[DONE]`, or common `{delta|text|content}` JSON envelopes.
   ========================================================================= */

export type StreamChunk = string | Uint8Array;
export type StreamSource =
  | string
  | URL
  | Response
  | ReadableStream<StreamChunk>
  | AsyncIterable<StreamChunk>
  | Iterable<StreamChunk>;

export interface ConnectOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  method?: string;
  body?: BodyInit;
  /** rewrite every text chunk before it reaches the compiler */
  transform?: (text: string) => string;
  /** framing of a bare stream (Response content-type is auto-detected) */
  format?: "ndjson" | "sse";
  /** SSE payload handling; default "auto" */
  sse?: "auto" | "raw" | "json-delta";
}

function decodeChunk(chunk: StreamChunk, decoder: TextDecoder): string {
  return typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
}

async function pumpStream(
  stream: ReadableStream<StreamChunk>,
  onText: (text: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      const text = decodeChunk(value, decoder);
      if (text) onText(text);
    }
    const tail = decoder.decode();
    if (tail) onText(tail);
  } finally {
    reader.releaseLock();
  }
}

async function pumpIterable(
  source: AsyncIterable<StreamChunk> | Iterable<StreamChunk>,
  onText: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of source as AsyncIterable<StreamChunk>) {
    const text = decodeChunk(chunk, decoder);
    if (text) onText(text);
  }
  const tail = decoder.decode();
  if (tail) onText(tail);
}

async function* ssePayloads(stream: ReadableStream<StreamChunk>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decodeChunk(value, decoder);
      buffer = buffer.replace(/\r\n/g, "\n");
      let cut: number;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const lines = event.split("\n");
        const data = lines
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
      }
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n").trim();
    if (buffer) {
      const data = buffer
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

function unwrapSseData(data: string, mode: NonNullable<ConnectOptions["sse"]>): string | null {
  if (data === "[DONE]") return null;
  if (mode === "raw") return data.endsWith("\n") ? data : data + "\n";
  try {
    const value: unknown = JSON.parse(data);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.t === "string") return data + "\n"; // already an IUI op
      if (record.error) throw new Error(String(record.error));
      const pick = (v: unknown): string | null =>
        typeof v === "string" ? v : null;
      const delta =
        pick(record.delta) ??
        pick(record.text) ??
        pick(record.content) ??
        pick(record.ndjson) ??
        (Array.isArray(record.choices)
          ? pick((record.choices[0] as { delta?: { content?: unknown } })?.delta?.content)
          : null);
      if (delta !== null) return delta;
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      // not JSON — assume it is already NDJSON text
    } else {
      throw err;
    }
  }
  return data + "\n";
}

async function pumpSse(
  stream: ReadableStream<StreamChunk>,
  onText: (text: string) => void,
  mode: NonNullable<ConnectOptions["sse"]>,
): Promise<void> {
  for await (const payload of ssePayloads(stream)) {
    const text = unwrapSseData(payload, mode);
    if (text) onText(text);
  }
}

/** Pump any supported source into `onText`. */
export async function connectSource(
  source: StreamSource,
  onText: (text: string) => void,
  options: ConnectOptions = {},
): Promise<void> {
  const transform = options.transform;
  const emit = (text: string) => {
    if (!text) return;
    onText(transform ? transform(text) : text);
  };

  if (typeof source === "string" || source instanceof URL) {
    const headers: Record<string, string> = {
      Accept: "application/x-ndjson, text/event-stream, text/plain",
      ...options.headers,
    };
    const response = await fetch(source.toString(), {
      method: options.method ?? "GET",
      headers,
      credentials: options.credentials,
      body: options.body,
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`IUI stream failed: HTTP ${response.status} ${response.statusText}`);
    }
    return connectResponse(response, emit, options);
  }

  if (source instanceof Response) {
    return connectResponse(source, emit, options);
  }

  if (typeof ReadableStream !== "undefined" && source instanceof ReadableStream) {
    if (options.format === "sse") {
      return pumpSse(source as ReadableStream<StreamChunk>, emit, options.sse ?? "auto");
    }
    return pumpStream(source as ReadableStream<StreamChunk>, emit);
  }

  return pumpIterable(source as AsyncIterable<StreamChunk>, emit);
}

async function connectResponse(
  response: Response,
  emit: (text: string) => void,
  options: ConnectOptions,
): Promise<void> {
  if (!response.body) throw new Error("IUI stream response has no body");
  const type = response.headers.get("content-type") ?? "";
  const stream = response.body as ReadableStream<Uint8Array>;
  if (options.format === "sse" || type.includes("text/event-stream")) {
    return pumpSse(stream, emit, options.sse ?? "auto");
  }
  return pumpStream(stream, emit);
}
