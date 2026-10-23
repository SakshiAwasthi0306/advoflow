// Save an OpenRouter API key into .env.local without it ever appearing on screen, in shell history or in logs.
//   npm run ai:set-key        (run it in the Terminal app; it asks for the key with hidden input)
// Replaces an existing OPENROUTER_API_KEY line, keeps everything else in the file, and makes the file
// readable by you only. .env.local is git-ignored, so the key is never committed.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const FILE = ".env.local";

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.error("Run this in the Terminal app (it needs to read your typing). It cannot run inside the chat box.");
      process.exit(2);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => { if (!muted) out.output.write(s); };
    rl.question(prompt, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.trim()); });
    muted = true; // everything typed or pasted after the prompt stays hidden
  });
}

async function main() {
  const key = await askHidden("Paste your OpenRouter API key (it will stay hidden) and press Enter: ");
  if (!/^sk-or-v1-[A-Za-z0-9]{20,}$/.test(key)) {
    console.error("That does not look like an OpenRouter key (they start with sk-or-v1-). Nothing was saved.");
    process.exit(1);
  }
  const lines = existsSync(FILE) ? readFileSync(FILE, "utf8").split("\n").filter((l) => !l.startsWith("OPENROUTER_API_KEY=")) : [];
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.push(`OPENROUTER_API_KEY=${key}`, "");
  writeFileSync(FILE, lines.join("\n"), { mode: 0o600 });
  chmodSync(FILE, 0o600);
  console.log(`Saved to ${FILE}. Now tell Claude "done".`);
}
void main();
