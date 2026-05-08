import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const builtAt = process.env.BUILD_AT || new Date().toISOString();
const outputDir = path.resolve("dist");
const outputFile = path.join(outputDir, "build-info.json");

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  outputFile,
  `${JSON.stringify(
    {
      builtAt
    },
    null,
    2
  )}\n`
);
