import * as env from "@env";
import * as sys from "@sys";

import { checkFile, checkFolder, convertSvgToIcns, convertSvgToIco, makePath, normalizePath, packageResources } from "packer.js";

function defaultLogger(logger) {
  return {
    add: logger?.add ? logger.add.bind(logger) : () => {},
    clear: logger?.clear ? logger.clear.bind(logger) : () => {},
    status: logger?.status ? logger.status.bind(logger) : () => {},
  };
}

export function getScappPath(target) {
  switch (target) {
    case "winX32": return checkFile(env.home("../x32/scapp.exe")) || checkFile(env.home("../../bin/windows/x32/scapp.exe"));
    case "winX64": return checkFile(env.home("../x64/scapp.exe")) || checkFile(env.home("../../bin/windows/x64/scapp.exe"));
    case "winARM64": return checkFile(env.home("../arm64/scapp.exe")) || checkFile(env.home("../../bin/windows/arm64/scapp.exe"));
    case "mac": return checkFile(env.home("scapp")) || checkFile(env.home("../../bin/macosx/scapp"));
    case "linuxX64": return checkFile(env.home("../x64/scapp")) || checkFile(env.home("../../bin/linux/x64/scapp"));
    case "linuxARM32": return checkFile(env.home("../arm32/scapp")) || checkFile(env.home("../../bin/linux/arm32/scapp"));
  }
}

function mkAppleBundle(exefile, params) {
  const plistInfo = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleIVersion</key>
  <string>{version}</string>
  <key>CFBundleShortVersionString</key>
  <string>{version}</string>
  <key>CFBundleIdentifier</key>
  <string>{name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleSignature</key>
  <string>MOOS</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.9</string>
  <key>NSMainNibFile</key>
  <string>MainMenu</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>CFBundleName</key>
  <string>{name}</string>
  <key>CFBundleExecutable</key>
  <string>{name}</string>
  <key>CFBundleIconFile</key>
  <string>{name}.icns</string>
</dict>
</plist>`;

  function copyFileForce(fnSrc, fnDes) {
    if (sys.fs.$stat(fnDes)) sys.fs.$unlink(fnDes);
    sys.fs.$copyfile(fnSrc, fnDes);
  }

  makePath(params.out, ["macos", `${params.exe}.app`, "Contents", "MacOS"], "");
  makePath(params.out, ["macos", `${params.exe}.app`, "Contents", "Resources"], "");

  let appPath = `${normalizePath(params.out)}/macos/${params.exe}.app`;
  sys.fs.$chmod(appPath, 0o755);
  appPath += "/Contents";

  const fn = sys.fs.$open(appPath + "/Info.plist", "w");
  if (!fn) throw new Error("Can't open Info.plist to write");

  const plist = plistInfo.replaceAll("{name}", params.exe).replaceAll("{version}", params.productVersion || "1.0.0");
  fn.$write(plist);
  fn.$close();

  copyFileForce(exefile, appPath + "/MacOS/" + params.exe);
  sys.fs.$chmod(appPath + "/MacOS/" + params.exe, 0o755);
  copyFileForce(`${normalizePath(params.out)}/icon.icns`, `${appPath}/Resources/${params.exe}.icns`);
}

function assembleExe(scappPath, datfile, exefile, params, { logger }) {
  const r = Window.this.scapp.assembleExe(scappPath, datfile, exefile, params);
  switch (r) {
    case 0: logger.add("Done!", "result"); break;
    case 1: logger.add("Done, but no metadata update", "result"); break;
    case -1: logger.add("FAILURE, no .dat file", "stderr"); break;
    case -2: logger.add("FAILURE opening output file", "stderr"); break;
    case -3: logger.add("FAILURE writing output file", "stderr"); break;
    default: logger.add(`FAILURE, assembleExe status=${r}`, "stderr"); break;
  }
  return r;
}

async function buildTarget(target, datfile, params, { logger }) {
  logger.status?.(`Building ${target}...`);

  const scappPath = getScappPath(target);
  if (!scappPath) throw new Error(`No scapp found for target ${target}`);

  const out = normalizePath(params.out);

  switch (target) {
    case "winX32": {
      const icofile = `${out}/${params.exe}.ico`;
      await convertSvgToIco(params.logo, icofile, { logger });
      const exefile = makePath(out, ["windows", "x32"], params.exe + ".exe");
      const p = Object.assign({}, params, { icofile });
      logger.add(`${target}: assembling...`, "initial");
      const r = assembleExe(scappPath, datfile, exefile, p, { logger });
      if (r < 0) throw new Error(`${target}: assembleExe failed (${r})`);
    } break;

    case "winX64": {
      const icofile = `${out}/${params.exe}.ico`;
      await convertSvgToIco(params.logo, icofile, { logger });
      const exefile = makePath(out, ["windows", "x64"], params.exe + ".exe");
      const p = Object.assign({}, params, { icofile });
      logger.add(`${target}: assembling...`, "initial");
      const r = assembleExe(scappPath, datfile, exefile, p, { logger });
      if (r < 0) throw new Error(`${target}: assembleExe failed (${r})`);
    } break;

    case "winARM64": {
      const icofile = `${out}/${params.exe}.ico`;
      await convertSvgToIco(params.logo, icofile, { logger });
      const exefile = makePath(out, ["windows", "arm64"], params.exe + ".exe");
      const p = Object.assign({}, params, { icofile });
      logger.add(`${target}: assembling...`, "initial");
      const r = assembleExe(scappPath, datfile, exefile, p, { logger });
      if (r < 0) throw new Error(`${target}: assembleExe failed (${r})`);
    } break;

    case "mac": {
      await convertSvgToIcns(params.logo, out, { logger });
      const exefile = makePath(out, ["macos"], params.exe);
      logger.add(`${target}: assembling...`, "initial");
      const r = assembleExe(scappPath, datfile, exefile, params, { logger });
      if (r < 0) throw new Error(`${target}: assembleExe failed (${r})`);
      mkAppleBundle(exefile, params);
    } break;

    case "linuxX64": {
      const exefile = makePath(out, ["linux", "x64"], params.exe);
      logger.add(`${target}: assembling...`, "initial");
      const r = assembleExe(scappPath, datfile, exefile, null, { logger });
      if (r < 0) throw new Error(`${target}: assembleExe failed (${r})`);
    } break;

    case "linuxARM32": {
      const exefile = makePath(out, ["linux", "arm32"], params.exe);
      logger.add(`${target}: assembling...`, "initial");
      const r = assembleExe(scappPath, datfile, exefile, null, { logger });
      if (r < 0) throw new Error(`${target}: assembleExe failed (${r})`);
    } break;

    default:
      throw new Error(`Unknown target ${target}`);
  }
}

export async function assembleProject(params, { logger } = {}) {
  const l = defaultLogger(logger);
  l.clear();

  const resources = normalizePath(params.resources);
  const out = normalizePath(params.out);

  if (!checkFolder(resources, false)) {
    l.add(`Error: ${resources} is not a readable folder`, "stderr");
    return { ok: false, exitCode: 2 };
  }

  if (!checkFolder(out, true)) {
    l.add(`Error: ${out} is not a writeable folder`, "stderr");
    return { ok: false, exitCode: 2 };
  }

  const datfile = `${out}/${params.exe}.dat`;

  try {
    l.status?.("Packing resources...");
    await packageResources(resources, datfile, { logger: l });

    const targets = Array.isArray(params.targets) ? params.targets : [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      l.status?.(`(${i + 1}/${targets.length}) ${target}`);
      await buildTarget(target, datfile, params, { logger: l });
    }

    l.status?.("Done");
    l.add("All targets complete.", "result");
    return { ok: true, exitCode: 0 };
  } catch (e) {
    l.status?.("Failed");
    l.add(e?.message ? e.message : String(e), "stderr");
    return { ok: false, exitCode: 1 };
  }
}
