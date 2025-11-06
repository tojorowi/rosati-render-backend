import { z } from "zod";

export const tidySchema = z.object({
  prompt: z.string().min(2).max(1000)
});

export const renderSchema = z.object({
  prompt: z.string().min(2).max(1000),
  n: z.coerce.number().int().min(1).max(4).default(2),
  size: z.enum(["1024x1024","1536x1536","2048x2048"]).default("1536x1536")
});