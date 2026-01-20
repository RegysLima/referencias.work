import fs from "node:fs";
import path from "node:path";
import { ReferenceDB } from "./types";

export function loadReferences(): ReferenceDB {
  const p = path.join(process.cwd(), "public", "data", "references.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw) as ReferenceDB;
}
