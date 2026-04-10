import { z } from "zod";

/**
 * Schema for Claude settings.json files
 */
export const SettingsSchema = z
  .object({
    apiKeyHelper: z.string().optional(),
    env: z.record(z.string(), z.string()).optional().default({}),
    enabledPlugins: z.record(z.string(), z.boolean()).optional(),
    model: z.string().optional(),
  })
  .passthrough();

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Profile metadata with name and file path
 */
export interface Profile {
  name: string;
  file: string;
}
