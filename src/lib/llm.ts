export type LLMOpts = {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export async function generate(prompt: string, opts: LLMOpts = {}) {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = opts.model || process.env.TOGETHER_MODEL || "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";
  if (!apiKey) throw new Error("TOGETHER_API_KEY missing");
  const res = await fetch("https://api.together.xyz/inference", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{ role: "system", content: opts.system || "You are a helpful assistant for medical study content." },
              { role: "user", content: prompt }],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false
    })
  });
  if (!res.ok) throw new Error(`Together API error ${res.status}`);
  const data = await res.json();
  const text = data?.output_text || data?.output?.[0]?.content || JSON.stringify(data);
  return String(text);
}
