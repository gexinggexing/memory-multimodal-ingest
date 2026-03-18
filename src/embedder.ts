export interface MultimodalEmbedderConfig {
  apiKey: string;
  model: string;
  apiBase: string;
  dimensions: number;
}

export class MultimodalEmbedder {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiBase: string;
  readonly dimensions: number;

  constructor(config: MultimodalEmbedderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model.startsWith("models/") ? config.model : `models/${config.model}`;
    this.apiBase = config.apiBase.replace(/\/+$/, "");
    this.dimensions = config.dimensions;
  }

  async embedText(text: string): Promise<number[]> {
    return this.embedParts([{ text }]);
  }

  async embedInlineData(mimeType: string, data: Uint8Array): Promise<number[]> {
    return this.embedParts([{
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(data).toString("base64")
      }
    }]);
  }

  async embedInlineDataWithText(mimeType: string, data: Uint8Array, text?: string): Promise<number[]> {
    const parts: Array<Record<string, unknown>> = [{
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(data).toString("base64")
      }
    }];
    if (text && text.trim()) {
      parts.push({ text: text.trim() });
    }
    return this.embedParts(parts);
  }

  private async embedParts(parts: unknown[]): Promise<number[]> {
    const res = await fetch(
      `${this.apiBase}/${this.model}:embedContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          content: { parts }
        })
      }
    );

    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(`Gemini embedContent failed (${res.status}): ${bodyText}`);
    }

    const body = JSON.parse(bodyText) as { embedding?: { values?: number[] } };
    const values = body.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Gemini embedContent returned no embedding values");
    }
    if (values.length !== this.dimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimensions}, got ${values.length}`);
    }
    return values;
  }
}
