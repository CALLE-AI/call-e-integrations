import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_DATE = new Date("2024-01-01T00:00:00Z");
const EXCLUDED_NAMES = new Set([
  "node_modules", "__pycache__", "venv", "dist", "coverage", "logs",
  "credentials.json", "secret.json", "secrets.json", "token.json", "tokens.json",
]);
const TEST_ONLY_DIRECTORIES = new Set(["evals", "tests"]);

function isExcluded(name) {
  return name.startsWith(".") || EXCLUDED_NAMES.has(name.toLowerCase()) ||
    /\.(?:env|key|pem|p12|pfx|pyc|pyo|log)$/iu.test(name);
}

function usage() {
  console.error("Usage: node scripts/pack-skills.mjs [--public] [--all|<skill-name> ...]");
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function assertSkillName(skillName) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(skillName) || skillName.length > 64) {
    throw new Error(`Invalid skill name "${skillName}".`);
  }
}

function assertSkillFrontmatter(skillName, skillMarkdown) {
  const match = /^---\n([\s\S]*?)\n---\n?/u.exec(skillMarkdown);
  if (!match) {
    throw new Error(`${skillName}: SKILL.md must start with YAML frontmatter.`);
  }

  const frontmatter = match[1];
  const nameMatch = /^name:\s*([^\n]+)\s*$/mu.exec(frontmatter);
  const descriptionMatch = /^description:\s*/mu.exec(frontmatter);

  if (!nameMatch) {
    throw new Error(`${skillName}: frontmatter is missing "name".`);
  }

  if (!descriptionMatch) {
    throw new Error(`${skillName}: frontmatter is missing "description".`);
  }

  const declaredName = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
  if (declaredName !== skillName) {
    throw new Error(
      `${skillName}: frontmatter name "${declaredName}" must match the directory name.`,
    );
  }
}

function collectSkillFiles(skillName, skillsRoot) {
  assertSkillName(skillName);

  const skillRoot = path.join(skillsRoot, skillName);
  const skillFile = path.join(skillRoot, "SKILL.md");

  if (!fs.existsSync(skillRoot)) {
    throw new Error(`Unknown skill "${skillName}" at ${skillRoot}.`);
  }

  if (!fs.lstatSync(skillRoot).isDirectory()) {
    throw new Error(`${skillName}: skill source must be a directory, not a symlink.`);
  }

  if (!fs.existsSync(skillFile) || !fs.lstatSync(skillFile).isFile()) {
    throw new Error(`${skillName}: missing SKILL.md.`);
  }

  assertSkillFrontmatter(skillName, fs.readFileSync(skillFile, "utf8"));

  const files = [];

  function walk(currentDir) {
    const dirents = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .filter((dirent) => !isExcluded(dirent.name) &&
        !(dirent.isDirectory() && TEST_ONLY_DIRECTORIES.has(dirent.name.toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of dirents) {
      const absolutePath = path.join(currentDir, dirent.name);
      const relativePath = path.relative(skillRoot, absolutePath);

      if (dirent.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!dirent.isFile()) {
        continue;
      }

      files.push({
        absolutePath,
        relativePath,
        archivePath: toPosixPath(path.posix.join(skillName, relativePath)),
      });
    }
  }

  walk(skillRoot);
  return files;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateParts(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function createStoredZip(entries, outFile) {
  const { dosTime, dosDate } = zipDateParts(FIXED_DATE);
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.archivePath, "utf8");
    const fileData = fs.readFileSync(entry.absolutePath);
    const checksum = crc32(fileData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(fileData.length, 18);
    localHeader.writeUInt32LE(fileData.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileName, fileData);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(fileData.length, 20);
    centralHeader.writeUInt32LE(fileData.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileName);

    localOffset += localHeader.length + fileName.length + fileData.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    Buffer.concat([...localParts, centralDirectory, endRecord]),
  );
}

function copySkillTree(skillName, files, distRoot) {
  const distSkillRoot = path.join(distRoot, skillName);
  fs.rmSync(distSkillRoot, { recursive: true, force: true });
  fs.mkdirSync(distSkillRoot, { recursive: true });

  for (const file of files) {
    const outPath = path.join(distSkillRoot, file.relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(file.absolutePath, outPath);
  }

  return distSkillRoot;
}

function packSkill(skillName, skillsRoot, distRoot) {
  const files = collectSkillFiles(skillName, skillsRoot);
  const distSkillRoot = copySkillTree(skillName, files, distRoot);
  const zipPath = path.join(distRoot, `${skillName}.zip`);
  createStoredZip(files, zipPath);
  return { skillName, distSkillRoot, zipPath, fileCount: files.length };
}

function listSkillNames(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) {
    return [];
  }

  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && !isExcluded(dirent.name))
    .map((dirent) => dirent.name)
    .sort();
}

export function main(args = process.argv.slice(2), { repoRoot = REPO_ROOT, log = console.log } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return [];
  }

  const skillsRoot = path.join(repoRoot, ...(args.includes("--public") ? ["skills"] : [".agents", "skills"]));
  const distRoot = path.join(repoRoot, "dist", "skills");
  const names = args.filter((arg) => arg !== "--public" && arg !== "--all");
  names.forEach(assertSkillName);
  const requestedSkills =
    names.length === 0 || args.includes("--all")
      ? listSkillNames(skillsRoot)
      : names;

  if (requestedSkills.length === 0) {
    throw new Error("No skills found to pack.");
  }

  const results = requestedSkills.map((name) => packSkill(name, skillsRoot, distRoot));
  for (const result of results) {
    log(
      `Packed ${result.skillName}: ${result.fileCount} file(s) -> ${result.zipPath}`,
    );
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
