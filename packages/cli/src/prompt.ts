import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/** Minimal readline wrappers; the CLI has no dependency budget for a TUI. */

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  const answer = (await ask(`${question} [y/N] `)).toLowerCase();
  return answer === "y" || answer === "yes";
}
