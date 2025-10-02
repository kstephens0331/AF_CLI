import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type ProductSpec = any;

export function loadProductSpecOrNull(projectRoot: string): { raw: string; asJson: ProductSpec } | null {
  const p = path.join(projectRoot, "product.spec.yml");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8");
  const asJson = yaml.load(raw);
  return { raw, asJson };
}
