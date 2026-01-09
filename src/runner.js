import * as sys from "@sys";
import * as sciter from "@sciter";

function safeString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try { return String(value); } catch { return ""; }
}

export async function runCommand(args, { logger } = {}) {
  const log = logger?.add ? (t, ty) => logger.add(t, ty) : () => {};

  if (!Array.isArray(args) || args.length === 0)
    throw new Error("runCommand: args must be a non-empty array");

  log(args.join(" "), "initial");

  async function readPipe(pipe, type) {
    try {
      while (pipe) {
        const buffer = await pipe.read();
        if (!buffer || buffer.byteLength === 0) break;
        const text = sciter.decode(buffer);
        if (text) log(text, type);
      }
    } catch {
      // ignore pipe errors
    }
  }

  const proxy = sys.spawn(args, { stdout: "pipe", stderr: "pipe" });
  if (!proxy) throw new Error(`runCommand: failed to spawn: ${safeString(args[0])}`);

  readPipe(proxy.stdout, "stdout");
  readPipe(proxy.stderr, "stderr");

  const ro = await proxy.wait();
  return ro.exitCode;
}
