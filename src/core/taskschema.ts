import { z } from "zod";

export const PatchAction = z.object({
  type: z.literal("patch"),
  description: z.string().optional(),
  diff: z.string().min(1)
});

export const ExecAction = z.object({
  type: z.literal("exec"),
  description: z.string().optional(),
  command: z.string().min(1)
});

export const CheckAction = z.object({
  type: z.literal("check"),
  description: z.string().optional()
});

export const DeployAction = z.object({
  type: z.literal("deploy"),
  description: z.string().optional(),
  prod: z.boolean().optional()
});

export const HumanGateAction = z.object({
  type: z.literal("human_gate"),
  reason: z.string(),
  checklist: z.array(z.string()).min(1)
});

const providerEnum = z.enum(["local", "github", "vercel", "railway"]);
const scopeEnum = z.enum(["development", "preview", "production"]);

export const EnvRequestAction = z.object({
  type: z.literal("env_request"),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    requiredProviders: z.array(providerEnum).optional(),   // default: enabled deploy providers + local
    scopes: z.array(scopeEnum).optional()                   // default: ["development","preview","production"]
  })).min(1)
});

export const ActionSchema = z.discriminatedUnion("type", [
  PatchAction,
  ExecAction,
  CheckAction,
  DeployAction,
  HumanGateAction,
  EnvRequestAction
]);

export type Action = z.infer<typeof ActionSchema>;

export const ChatPlanSchema = z.object({
  assistant_reply: z.string().default(""),
  actions: z.array(ActionSchema).default([])
});

export type ChatPlan = z.infer<typeof ChatPlanSchema>;
