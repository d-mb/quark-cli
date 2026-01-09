import * as env from "@env";
import * as sys from "@sys";

import { runCommand } from "runner.js";

export function normalizePath(p) {
  return (p ?? "").toString().replaceAll("\\\\", "/");
}

export function checkFile(path) {
  if (sys.fs.$stat(path)) return path;
  return null;
}

export function checkFolder(folderPath, forWriting = false) {
  const S_IFDIR = 0x4000;
  const S_IWRITE = 0x0080;
  const S_IREAD = 0x0100;

  const modes = forWriting ? (S_IFDIR | S_IWRITE) : (S_IFDIR | S_IREAD);

  const stat = sys.fs.$stat(folderPath);
  if (stat)
    return (stat.st_mode & modes) == modes;

  return false;
}

export function getPackfolderPath() {
  if (env.PLATFORM == "Windows") {
    return checkFile(env.home("../packfolder.exe")) ||
      checkFile(env.home("../../bin/windows/packfolder.exe"));
  }
  else if (env.PLATFORM == "OSX") {
    return checkFile(env.home("packfolder")) ||
      checkFile(env.home("../../bin/macosx/packfolder"));
  }
  else if (env.PLATFORM == "Linux") {
    return checkFile(env.home("../packfolder")) ||
      checkFile(env.home("../../bin/linux/packfolder"));
  }
}

export function makePath(dir, subdirs, nameext) {
  let path = normalizePath(dir);
  for (const sub of subdirs) {
    path += "/";
    path += sub;
    if (checkFile(path)) continue;
    if (!sys.fs.$mkdir(path)) throw new Error("makePath: cannot create dir: " + path);
  }
  return path + "/" + nameext;
}

export async function packageResources(folder, datfile, { logger } = {}) {
  const packfolder = getPackfolderPath();
  if (!packfolder)
    throw new Error("packageResources: no packfolder executable found");

  const args = [packfolder, normalizePath(folder), normalizePath(datfile), "-binary"];
  const r = await runCommand(args, { logger });
  if (r != 0) throw new Error(`packfolder: failed to produce ${datfile} file, status=${r}`);
}

export async function convertSvgToIco(inp, outp, { logger } = {}) {
  const args = ["magick", "-density", "256x256", "-background", "transparent", normalizePath(inp), "-define", "icon:auto-resize", "-colors", "256", normalizePath(outp)];
  const r = await runCommand(args, { logger });
  if (r != 0) throw new Error("convertSvgToIco: failed to produce .ICO file");
}

// Use Sciter's Graphics to rasterize SVG into PNGs, then iconutil to convert into icns
export async function convertSvgToIcns(inf, outp, { logger } = {}) {
  async function svg2png(pathin, pathout, w, h) {
    w *= 1;
    h *= 1;
    const svg = await Graphics.Image.load(pathin);
    if (!svg) throw new Error(`convertSvgToIcns: cannot read ${pathin}`);
    const out = new Graphics.Image(w, h, gfx => { gfx.draw(svg, { x: 0, y: 0, width: w, height: h }); });
    const bytes = out.toBytes();
    const file = await sys.fs.open(pathout, "w");
    await file.write(bytes);
    await file.close();
  }

  const iconset = [
    { size: 16, name: "16x16" },
    { size: 32, name: "16x16@2x" },
    { size: 32, name: "32x32" },
    { size: 64, name: "32x32@2x" },
    { size: 128, name: "128x128" },
    { size: 256, name: "128x128@2x" },
    { size: 256, name: "256x256" },
    { size: 512, name: "256x256@2x" },
    { size: 512, name: "512x512" },
    { size: 1024, name: "512x512@2x" }
  ];

  const setfolder = makePath(normalizePath(outp), ["icon.iconset"], "");
  for (const icon of iconset) {
    const outf = setfolder + "icon_" + icon.name + ".png";
    await svg2png(normalizePath(inf), outf, icon.size, icon.size);
  }

  const r = await runCommand(["iconutil", "--convert", "icns", setfolder], { logger });
  if (r != 0) throw new Error("convertSvgToIcns: failed to produce icon.icns file");
}
