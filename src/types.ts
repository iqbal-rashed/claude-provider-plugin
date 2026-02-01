import { z } from "zod";

/**
 * Schema for Claude settings.json files
 */
export const SettingsSchema = z.object({
  env: z.record(z.string(), z.string()).optional().default({}),
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Profile metadata with name and file path
 */
export interface Profile {
  name: string;
  file: string;
}
