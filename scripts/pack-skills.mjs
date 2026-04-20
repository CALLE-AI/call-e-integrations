import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SKILLS_ROOT = path.join(REPO_ROOT, "skills");
const DIST_ROOT = path.join(REPO_ROOT, "dist", "skills");
const FIXED_DATE = new Date("2024-01-01T00:00:00Z");

function usage() {
  console.error("Usage: node scripts/pack-skills.mjs [--all|<skill-name> ...]");
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
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

function collectSkillFiles(skillName) {
  const skillRoot = path.join(SKILLS_ROOT, skillName);
  const skillFile = path.join(skillRoot, "SKILL.md");

  if (!fs.existsSync(skillRoot)) {
    throw new Error(`Unknown skill "${skillName}" at ${skillRoot}.`);
  }

  if (!fs.existsSync(skillFile)) {
    throw new Error(`${skillName}: missing SKILL.md.`);
  }

  assertSkillFrontmatter(skillName, fs.readFileSync(skillFile, "utf8"));

  const files = [];

  function walk(currentDir) {
    const dirents = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .filter((dirent) => dirent.name !== ".DS_Store")
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

function copySkillTree(skillName, files) {
  const distSkillRoot = path.join(DIST_ROOT, skillName);
  fs.rmSync(distSkillRoot, { recursive: true, force: true });
  fs.mkdirSync(distSkillRoot, { recursive: true });

  for (const file of files) {
    const outPath = path.join(distSkillRoot, file.relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(file.absolutePath, outPath);
  }

  return distSkillRoot;
}

function packSkill(skillName) {
  const files = collectSkillFiles(skillName);
  const distSkillRoot = copySkillTree(skillName, files);
  const zipPath = path.join(DIST_ROOT, `${skillName}.zip`);
  createStoredZip(files, zipPath);
  return { skillName, distSkillRoot, zipPath, fileCount: files.length };
}

function listSkillNames() {
  if (!fs.existsSync(SKILLS_ROOT)) {
    return [];
  }

  return fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort();
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  const requestedSkills =
    args.length === 0 || args.includes("--all")
      ? listSkillNames()
      : args.filter((arg) => arg !== "--all");

  if (requestedSkills.length === 0) {
    throw new Error("No skills found to pack.");
  }

  const results = requestedSkills.map(packSkill);
  for (const result of results) {
    console.log(
      `Packed ${result.skillName}: ${result.fileCount} file(s) -> ${result.zipPath}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
