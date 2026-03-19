declare module "openclaw/plugin-sdk" {
  export interface OpenClawToolResult {
    content: Array<{ type: string; text: string }>;
    details?: unknown;
  }

  export interface OpenClawToolDefinition {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (toolCallId: string, params: unknown) => Promise<OpenClawToolResult> | OpenClawToolResult;
  }

  export interface OpenClawPluginApi {
    config: unknown;
    resolvePath: (value: string) => string;
    registerTool: (tool: OpenClawToolDefinition, options?: { name?: string }) => void;
    registerCli: (factory: unknown, options?: { commands?: string[] }) => void;
    logger: {
      info: (message: string) => void;
    };
  }
}
