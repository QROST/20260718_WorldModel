import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL(".", import.meta.url);
const promptPath = new URL("fork-the-block.prompt.txt", root);
const prompt = readFileSync(promptPath, "utf8");

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  if (!pass) process.exitCode = 1;
};

check("prompt <= 10,000 characters", prompt.length <= 10_000, `${prompt.length} characters`);
check("prompt leaves safety margin", prompt.length <= 9_500, `${10_000 - prompt.length} characters free`);
check("single-file output contract", prompt.includes("exactly one complete HTML document"));
check("offline architecture", prompt.includes("zero network requests"));
check("deterministic randomness", prompt.includes("Math.random is forbidden"));
check("core controls", ["COOL", "MOVE", "GATHER"].every((term) => prompt.includes(term)));
check("input cancellation", ["pointercancel", "lostpointercapture", "window blur"].every((term) => prompt.includes(term)));
check("no prompt TODO markers", !/\b(?:TODO|TBD)\b/.test(prompt));

const htmlArg = process.argv[2];
if (htmlArg) {
  const htmlPath = resolve(process.cwd(), htmlArg);
  check("dry-run HTML exists", existsSync(htmlPath), htmlPath);
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, "utf8").trim();
    check("HTML begins with doctype", /^<!doctype html>/i.test(html));
    check("HTML ends with closing tag", /<\/html>$/i.test(html));
    check("HTML has no remote URLs", !/https?:\/\//i.test(html));
    check("HTML has no module imports", !/<script[^>]+src=|\bimport\s+(?:[^(']|\()/i.test(html));
    check("HTML has no network primitives", !/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(/.test(html));
    check("HTML has no placeholders", !/\b(?:TODO|TBD|placeholder)\b/i.test(html));
    check("HTML has one document", (html.match(/<!doctype html>/gi) ?? []).length === 1);
  }
}

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

if (process.exitCode) {
  console.error("One Shot package verification failed.");
} else {
  console.log("One Shot package verification passed.");
}
