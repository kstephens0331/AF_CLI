export const mapPrompt = (chunk: string) => `
You are building med lecture study notes.
CHUNK:
${chunk}

Return JSON with { key_points: string[], pearls: string[], pitfalls: string[], tags: string[] }.
`;

export const reducePrompt = (items: any[]) => `
You are aggregating mapped items into a study pack.
Return JSON with { abstract, outline: string[], pearls: string[], cloze: string[], quiz: string[], vignettes: any[] }.
Items:
${JSON.stringify(items).slice(0, 4000)}
`;

export const reportPrompt = (pack: any) => `
Make a coverage report (JSON) with { objectives: string[], timeline: string[], pitfalls: string[] } for this pack:
${JSON.stringify(pack).slice(0, 4000)}
`;

export const vignetteBatchPrompt = (context: string) => `
Create 5 NBME-style vignettes (JSON list) from:
${context}
`;

export const directBatchPrompt = (context: string) => `
Create 20 direct QA items (JSON list) from:
${context}
`;
