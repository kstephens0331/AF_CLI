import { togetherChatCompletion } from "./llm.js";

export async function generateCommitMessage(opts: {
  cwd: string;
  model: string;
  plan: any;
}): Promise<{ title: string; body: string }> {
  const { cwd, model, plan } = opts;
  const sys = "You are a release/commit assistant. Produce a clear conventional commit title (max 80 chars) and a concise body.";
  const user = `Plan JSON:\n${JSON.stringify(plan, null, 2)}\n\nReturn STRICT JSON: {"title":"<conventional commit>","body":"<details>"}`;
  try {
    const raw = await togetherChatCompletion({
      cwd, model,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0.1
    });
    const cleaned = String(raw).trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
    const parsed = JSON.parse(cleaned);
    if (parsed?.title) {
      return { title: parsed.title, body: parsed.body ?? "" };
    }
  } catch {}
  // Fallback
  const n = Array.isArray(plan?.actions) ? plan.actions.length : 0;
  return { title: `feat: apply ${n} action(s) via AF`, body: "Auto-generated commit." };
}
