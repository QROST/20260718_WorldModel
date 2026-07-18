import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL(".", import.meta.url);
const prompt = readFileSync(new URL("fork-the-block.terra.prompt.txt", root), "utf8");
const htmlPath = resolve(process.cwd(), process.argv[2] ?? "submission/oneshot/dry-run-terra-v3.html");
const html = readFileSync(htmlPath, "utf8").trim();
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

const checks = [];
const check = (name, pass, detail = "") => {
  checks.push({ name, pass, detail });
  if (!pass) process.exitCode = 1;
};
const count = (pattern) => (html.match(pattern) ?? []).length;

check("prompt <= 10,000 characters", prompt.length <= 10_000, `${prompt.length} characters`);
check("prompt leaves at least 1,500 characters", prompt.length <= 8_500, `${10_000 - prompt.length} characters free`);
check("single HTML output contract", prompt.includes("Return only complete HTML"));
check("authored inline SVG architecture", prompt.includes("authored inline SVG") && prompt.includes("No Canvas"));
check("core intentions", ["COOL", "MOVE", "GATHER"].every((term) => prompt.includes(term)));
check("input cancellation contract", ["pointercancel", "lostpointercapture", "blur", "hidden visibility"].every((term) => prompt.includes(term)));
check("explicit parcel geometry", prompt.includes("#parcels") && prompt.includes("exactly two diagonal street centerlines"));

check("HTML begins with doctype", /^<!doctype html>/i.test(html));
check("HTML ends with closing tag", /<\/html>$/i.test(html));
check("exactly one document", count(/<!doctype html>/gi) === 1);
check("one inline SVG and no Canvas", count(/<svg\b/gi) === 1 && !/<canvas\b/i.test(html));
check("four or more real buttons", count(/<button\b/gi) >= 4, `${count(/<button\b/gi)} buttons`);
check("authored SVG density", count(/<g\b/gi) >= 30 && count(/<path\b/gi) >= 60, `${count(/<g\b/gi)} groups, ${count(/<path\b/gi)} paths`);
check("no remote URLs", !/https?:\/\//i.test(html));
check("no module imports", !/<script[^>]+src=|\bimport\s+(?:[^(']|\()/i.test(html));
check("no network primitives", !/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(/.test(html));
check("no unfinished markers", !/\b(?:TODO|TBD|placeholder)\b/i.test(html));

const requiredIds = [
  "ground", "roads", "parcels", "neutral-landmarks", "neutral-props",
  "cool-layer", "move-layer", "gather-layer", "cool-move-layer",
  "move-gather-layer", "gather-cool-layer", "living-layer", "highlight-layer",
];
check("all required SVG layers", requiredIds.every((id) => html.includes(`id="${id}"`)));
check("immediate persistent memory", /mem\[mode\]\s*=\s*cap\(mem\[mode\]\+\.12\)/.test(html));
check("pair and Living Block thresholds", html.includes(".55") && html.includes(".62"));
check("multi-source input Sets", ["new Set", "pointercancel", "lostpointercapture", "visibilitychange"].every((term) => html.includes(term)));

let scriptError = "";
try {
  scripts.forEach((script) => new Function(script));
} catch (error) {
  scriptError = error instanceof Error ? error.message : String(error);
}
check("one parseable inline script", scripts.length === 1 && !scriptError, scriptError || "syntax OK");

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

if (/calc\([^)]*\*/.test(html)) {
  console.log("WARN  decorative CSS uses multiplication inside calc(); opacity/state behavior does not depend on it");
}

console.log(process.exitCode ? "Terra package verification failed." : "Terra package verification passed.");
