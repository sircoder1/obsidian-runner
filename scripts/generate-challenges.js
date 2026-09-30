import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const challengeRoot = path.join(projectRoot, "challenges");

const categories = [
  { id: "foundations", title: "Foundations", description: "CLI structure, discovery, and the first command.", order: 1 },
  { id: "files", title: "Files", description: "Navigate, create, read, remove, search, and inspect files.", order: 2 },
  { id: "system", title: "System", description: "Enumerate identity, processes, accounts, environment, and storage.", order: 3 },
  { id: "network", title: "Network", description: "Test reachability, services, sockets, downloads, and SSH authentication.", order: 4 },
  { id: "data", title: "Data", description: "Hash content, recover MD5 test values, and query SQLite.", order: 5 },
  { id: "operations", title: "Operations", description: "Execute platform commands and collect screenshots.", order: 6 },
];

const docs = {
  functions: { title: "W3Schools: Python Functions", url: "https://www.w3schools.com/python/python_functions.asp" },
  print: { title: "W3Schools: Python print()", url: "https://www.w3schools.com/python/ref_func_print.asp" },
  dictionaries: { title: "W3Schools: Python Dictionaries", url: "https://www.w3schools.com/python/python_dictionaries.asp" },
  loops: { title: "W3Schools: Python For Loops", url: "https://www.w3schools.com/python/python_for_loops.asp" },
  fileHandling: { title: "W3Schools: Python File Handling", url: "https://www.w3schools.com/python/python_file_handling.asp" },
  fileWrite: { title: "W3Schools: Python File Write", url: "https://www.w3schools.com/python/python_file_write.asp" },
  fileRemove: { title: "W3Schools: Python File Remove", url: "https://www.w3schools.com/python/python_file_remove.asp" },
  regex: { title: "W3Schools: Python RegEx", url: "https://www.w3schools.com/python/python_regex.asp" },
  exceptions: { title: "W3Schools: Python Try/Except", url: "https://www.w3schools.com/python/python_try_except.asp" },
  argparse: { title: "Python docs: argparse", url: "https://docs.python.org/3/library/argparse.html" },
  pathlib: { title: "Python docs: pathlib", url: "https://docs.python.org/3/library/pathlib.html" },
  os: { title: "Python docs: os", url: "https://docs.python.org/3/library/os.html" },
  stat: { title: "Python docs: stat", url: "https://docs.python.org/3/library/stat.html" },
  getpass: { title: "Python docs: getpass.getuser()", url: "https://docs.python.org/3/library/getpass.html#getpass.getuser" },
  platform: { title: "Python docs: platform", url: "https://docs.python.org/3/library/platform.html" },
  subprocess: { title: "Python docs: subprocess", url: "https://docs.python.org/3/library/subprocess.html" },
  signal: { title: "Python docs: signal", url: "https://docs.python.org/3/library/signal.html" },
  socket: { title: "Python docs: socket", url: "https://docs.python.org/3/library/socket.html" },
  re: { title: "Python docs: re", url: "https://docs.python.org/3/library/re.html" },
  urllib: { title: "Python docs: urllib.request", url: "https://docs.python.org/3/library/urllib.request.html" },
  hashlib: { title: "Python docs: hashlib", url: "https://docs.python.org/3/library/hashlib.html" },
  sqlite: { title: "Python docs: sqlite3", url: "https://docs.python.org/3/library/sqlite3.html" },
  pwd: { title: "Python docs: pwd", url: "https://docs.python.org/3/library/pwd.html" },
  grp: { title: "Python docs: grp", url: "https://docs.python.org/3/library/grp.html" },
  psutil: { title: "psutil documentation", url: "https://psutil.io/" },
  paramiko: { title: "Paramiko: SSHClient API", url: "https://docs.paramiko.org/en/stable/api/client.html" },
  imageGrab: { title: "Pillow: ImageGrab", url: "https://pillow.readthedocs.io/en/stable/reference/ImageGrab.html" },
};

const level = (id, categoryId, order, title, situation, format, args, parameters = [], extra = {}) => ({
  id,
  categoryId,
  order,
  title,
  situation,
  description: extra.description ?? situation,
  command: {
    template: "python3 script.py <command> [arguments]",
    format,
    parameters,
  },
  expectedOutput: extra.expectedOutput ?? "Clear text output describing the result.",
  runner: {
    executable: "python3",
    args: ["script.py", ...args],
    installRequirements: false,
    prepare: extra.prepare ?? null,
    outputSeeds: extra.outputSeeds ?? [],
  },
  environmentNotes: extra.environmentNotes ?? [],
  files: extra.files ?? {},
});

const levels = [
  level("01-example", "foundations", 1, "Hello World", "Add the first command and verify that the CLI dispatches correctly.", "python3 script.py example", ["example"], [], { expectedOutput: "Hello World" }),
  level("02-commands", "foundations", 2, "Command Reference", "Make the tool describe every available command, its arguments, usage, and expected output.", "python3 script.py commands", ["commands"], [], { expectedOutput: "A readable table containing every registered command." }),

  level("03-pwd", "files", 1, "Working Directory", "Report the directory from which the tool is currently running.", "python3 script.py pwd", ["pwd"], [], { expectedOutput: "An absolute filesystem path." }),
  level("04-ls", "files", 2, "Directory Listing", "List a supplied folder while supporting the current directory as the default.", "python3 script.py ls <filepath>", ["ls", "{challenge}"], [{ name: "filepath", value: "Challenge folder", description: "Defaults to the current directory." }], { files: { "sample.txt": "alpha\nbeta\n", "nested/note.txt": "nested file\n" }, expectedOutput: "Entries in the supplied challenge folder." }),
  level("05-write-file", "files", 3, "Write a File", "Create a text file in the published output folder.", "python3 script.py writeFile <filename> <text>", ["writeFile", "{output}/created.txt", "Created by Obsidian Runner"], [{ name: "filename", value: "$LAB_OUTPUT/created.txt", description: "Published job output path." }, { name: "text", value: "Created by Obsidian Runner", description: "Text to write." }], { expectedOutput: "A success message and created.txt in the output folder." }),
  level("06-cat", "files", 4, "Read a File", "Print the complete contents of a supplied text file.", "python3 script.py cat <filepath>", ["cat", "{challenge}/briefing.txt"], [{ name: "filepath", value: "$LAB_CHALLENGE_DIR/briefing.txt", description: "Instructor-provided text file." }], { files: { "briefing.txt": "Obsidian Runner file-reading challenge.\nSecond line.\n" }, expectedOutput: "Both lines from briefing.txt." }),
  level("07-del", "files", 5, "Delete a File", "Delete the disposable file placed in the output folder for this run.", "python3 script.py del <filepath>", ["del", "{output}/delete-me.txt"], [{ name: "filepath", value: "$LAB_OUTPUT/delete-me.txt", description: "Disposable seeded output file." }], { outputSeeds: ["delete-me.txt"], files: { "delete-me.txt": "This file should be deleted.\n" }, expectedOutput: "A deletion confirmation; delete-me.txt should no longer be listed." }),
  level("08-find", "files", 6, "Recursive Find", "Recursively find files whose names partially match the supplied text.", "python3 script.py find <filename> <folder>", ["find", "config", "{challenge}"], [{ name: "filename", value: "config", description: "Partial filename match." }, { name: "folder", value: "$LAB_CHALLENGE_DIR", description: "Search root." }], { files: { "app/config.json": "{}\n", "backup/config.old": "backup\n", "notes.txt": "ignore\n" }, expectedOutput: "Paths for config.json and config.old." }),
  level("09-grep", "files", 7, "Regex Search", "Show every matching line and its line number in a text file.", "python3 script.py grep <filename> <regex>", ["grep", "{challenge}/events.log", "ERROR|WARN"], [{ name: "filename", value: "$LAB_CHALLENGE_DIR/events.log", description: "Log file to search." }, { name: "regex", value: "ERROR|WARN", description: "Regular expression." }], { files: { "events.log": "INFO boot complete\nWARN retrying connection\nINFO connected\nERROR simulated failure\n" }, expectedOutput: "Lines 2 and 4 with their line numbers." }),
  level("10-permissions", "files", 8, "File Permissions", "Display the mode and ownership details of an instructor-provided file.", "python3 script.py permissions <file>", ["permissions", "{challenge}/briefing.txt"], [{ name: "file", value: "$LAB_CHALLENGE_DIR/briefing.txt", description: "File to inspect." }], { files: { "briefing.txt": "Inspect my permissions.\n" }, expectedOutput: "Path, numeric mode, symbolic mode, owner, and group when available." }),

  level("11-whoami", "system", 1, "Current Identity", "Print the account running the student tool.", "python3 script.py whoami", ["whoami"], [], { expectedOutput: "The runner account name." }),
  level("12-hostname", "system", 2, "Hostname", "Print the machine hostname.", "python3 script.py hostname", ["hostname"], [], { expectedOutput: "The lab runner hostname." }),
  level("13-hostinfo", "system", 3, "Host Information", "Collect a concise operating-system, architecture, runtime, CPU, and memory summary.", "python3 script.py hostinfo", ["hostinfo"], [], { expectedOutput: "Structured host and Python runtime information." }),
  level("14-interfaces", "system", 4, "Network Interfaces", "List local network interfaces and their assigned addresses.", "python3 script.py interfaces", ["interfaces"], [], { expectedOutput: "Interface names with IPv4/IPv6 addresses." }),
  level("15-processes", "system", 5, "Process Inventory", "List running processes with stable fields suitable for later filtering.", "python3 script.py processes", ["processes"], [], { expectedOutput: "PID, user, process name, and command where available." }),
  level("16-process-kill", "system", 6, "Terminate a Process", "Terminate the disposable helper process created specifically for this level.", "python3 script.py processKill <PID>", ["processKill", "{helperPid}"], [{ name: "PID", value: "Runner-created disposable PID", description: "A safe helper process created for this job." }], { prepare: "sleeping-process", expectedOutput: "Confirmation that the disposable helper process was terminated." }),
  level("17-users", "system", 7, "Local Users", "List the local user accounts known to the operating system.", "python3 script.py users", ["users"], [], { expectedOutput: "Usernames and account metadata available on the platform." }),
  level("18-groups", "system", 8, "Group Membership", "List groups for the current account.", "python3 script.py groups", ["groups"], [], { expectedOutput: "Current account group memberships." }),
  level("19-env", "system", 9, "Environment", "List environment variable names and values visible to the tool.", "python3 script.py env", ["env"], [], { expectedOutput: "Sorted NAME=value environment lines, including LAB_* values." }),
  level("20-mounts", "system", 10, "Mounted Filesystems", "List mounted filesystems or logical drives.", "python3 script.py mounts", ["mounts"], [], { expectedOutput: "Mount point, device, filesystem type, and usage when available." }),

  level("21-ping", "network", 1, "Reachability", "Check whether the loopback target responds to a single platform-native ping.", "python3 script.py ping <IP>", ["ping", "127.0.0.1"], [{ name: "IP", value: "127.0.0.1", description: "Runner loopback address." }], { expectedOutput: "An online/offline result for 127.0.0.1." }),
  level("22-ports", "network", 2, "Listening Ports", "List local listening ports and resolve service or process details when possible.", "python3 script.py ports", ["ports"], [], { expectedOutput: "Listening TCP/UDP endpoints and service names." }),
  level("23-port-scan", "network", 3, "Single-Port Scan", "Test a runner-created TCP service using a host and port.", "python3 script.py portScan <host> <port>", ["portScan", "127.0.0.1", "{servicePort}"], [{ name: "host", value: "127.0.0.1", description: "Local challenge service." }, { name: "port", value: "Dynamically assigned", description: "Open TCP port supplied by the runner." }], { prepare: "banner-service", expectedOutput: "The supplied port is reported open." }),
  level("24-port-connect", "network", 4, "Banner Connection", "Connect to a runner-created TCP service and print the banner it sends.", "python3 script.py portConnect <host:port>", ["portConnect", "127.0.0.1:{servicePort}"], [{ name: "host:port", value: "127.0.0.1:<dynamic>", description: "Runner-created banner service." }], { prepare: "banner-service", expectedOutput: "C3T challenge service" }),
  level("25-download", "network", 5, "HTTP Download", "Download a runner-provided JSON document into the published output folder.", "python3 script.py download <sourceURL> <pathToSave>", ["download", "{downloadUrl}", "{output}/health.json"], [{ name: "sourceURL", value: "Runner-created local URL", description: "Disposable HTTP endpoint available only inside this job." }, { name: "pathToSave", value: "$LAB_OUTPUT/health.json", description: "Published output path." }], { prepare: "download-service", files: { "download-source.json": "{\"ok\":true,\"service\":\"obsidian-runner\"}\n" }, expectedOutput: "A download confirmation and health.json artifact." }),
  level("26-ssh-cracker", "network", 6, "SSH Password Audit", "Try the supplied classroom wordlist against the dedicated lab SSH account.", "python3 script.py sshCracker <user:IP:port> <passwordFile>", ["sshCracker", "{sshTarget}", "{challenge}/passwords.txt"], [{ name: "user:IP:port", value: "student:<lab-host>:<lab-port>", description: "Dedicated lab-only SSH service supplied by the runner." }, { name: "passwordFile", value: "$LAB_CHALLENGE_DIR/passwords.txt", description: "Small instructor wordlist." }], { files: { "passwords.txt": "training\nredteam\nobsidian\n" }, environmentNotes: ["Docker mode supplies the isolated ssh-lab service; local mode uses 127.0.0.1:2222."], expectedOutput: "The accepted lab password or a clear not-found result." }),

  level("27-hash-text", "data", 1, "Hash Text", "Calculate a SHA-256 digest for a supplied string.", "python3 script.py hashText <text>", ["hashText", "obsidian runner"], [{ name: "text", value: "obsidian runner", description: "Text to hash." }], { expectedOutput: "A SHA-256 hexadecimal digest." }),
  level("28-hash-file", "data", 2, "Hash a File", "Calculate a streaming SHA-256 digest for an instructor-provided file.", "python3 script.py hashFile <file>", ["hashFile", "{challenge}/evidence.bin"], [{ name: "file", value: "$LAB_CHALLENGE_DIR/evidence.bin", description: "File to hash." }], { files: { "evidence.bin": "C3T deterministic evidence\n" }, expectedOutput: "The file's SHA-256 hexadecimal digest." }),
  level("29-md5-cracker", "data", 3, "MD5 Wordlist Recovery", "Recover the classroom test value using the supplied MD5 hash and small wordlist.", "python3 script.py md5HashCracker <hashFilePath> <wordlistFilePath>", ["md5HashCracker", "{challenge}/hashes.txt", "{challenge}/wordlist.txt"], [{ name: "hashFilePath", value: "$LAB_CHALLENGE_DIR/hashes.txt", description: "Instructor-provided MD5 digest." }, { name: "wordlistFilePath", value: "$LAB_CHALLENGE_DIR/wordlist.txt", description: "Small classroom wordlist." }], { files: { "hashes.txt": `${crypto.createHash("md5").update("goldenkey").digest("hex")}\n`, "wordlist.txt": "password\nletmein\ngoldenkey\nobsidian\n" }, expectedOutput: "The recovered test value goldenkey." }),
  level("30-sqlite", "data", 4, "SQLite Query", "Run a read-only query against the supplied SQLite database.", "python3 script.py sqlite <filePath> <command>", ["sqlite", "{challenge}/inventory.db", "SELECT id, hostname, role FROM hosts ORDER BY id"], [{ name: "filePath", value: "$LAB_CHALLENGE_DIR/inventory.db", description: "Instructor SQLite database." }, { name: "command", value: "SELECT id, hostname, role FROM hosts ORDER BY id", description: "SQL statement." }], { expectedOutput: "Three host inventory rows." }),

  level("31-exec", "operations", 1, "Platform Command", "Run a simple platform command through Bash on Linux or PowerShell on Windows.", "python3 script.py exec <command>", ["exec", "printf 'runner-ok\\n'"], [{ name: "command", value: "printf 'runner-ok\\n'", description: "Non-interactive lab command." }], { expectedOutput: "runner-ok" }),
  level("32-screenshot", "operations", 2, "Screenshot Collection", "Capture the current desktop and save it beneath the published output folder.", "python3 script.py screenshot", ["screenshot"], [], { prepare: "virtual-display", environmentNotes: ["Docker mode creates a disposable virtual display for this job."], expectedOutput: "A screenshot path and image artifact in the output folder." }),
];

const resourcesByCommand = {
  example: [docs.print, docs.functions],
  commands: [docs.argparse, docs.dictionaries],
  pwd: [docs.pathlib, docs.os],
  ls: [docs.pathlib, docs.loops],
  writeFile: [docs.fileWrite, docs.pathlib],
  cat: [docs.fileHandling, docs.pathlib],
  del: [docs.fileRemove, docs.pathlib],
  find: [docs.pathlib, docs.os],
  grep: [docs.regex, docs.re],
  permissions: [docs.stat, docs.pathlib],
  whoami: [docs.getpass, docs.os],
  hostname: [docs.socket, docs.platform],
  hostinfo: [docs.platform, docs.psutil],
  interfaces: [docs.psutil, docs.socket],
  processes: [docs.psutil, docs.subprocess],
  processKill: [docs.psutil, docs.signal],
  users: [docs.pwd, docs.loops],
  groups: [docs.grp, docs.os],
  env: [docs.os, docs.dictionaries],
  mounts: [docs.psutil, docs.os],
  ping: [docs.subprocess, docs.exceptions],
  ports: [docs.psutil, docs.socket],
  portScan: [docs.socket, docs.exceptions],
  portConnect: [docs.socket, docs.exceptions],
  download: [docs.urllib, docs.fileWrite],
  sshCracker: [docs.paramiko, docs.fileHandling],
  hashText: [docs.hashlib, docs.functions],
  hashFile: [docs.hashlib, docs.fileHandling],
  md5HashCracker: [docs.hashlib, docs.loops],
  sqlite: [docs.sqlite, docs.exceptions],
  exec: [docs.subprocess, docs.exceptions],
  screenshot: [docs.imageGrab, docs.pathlib],
};

for (const definition of levels) {
  const commandName = definition.runner.args[1];
  definition.resources = resourcesByCommand[commandName];
  if (!definition.resources?.length) throw new Error(`No learning resources configured for ${commandName}.`);
}

await fs.mkdir(challengeRoot, { recursive: true });
await fs.writeFile(path.join(challengeRoot, "categories.json"), `${JSON.stringify(categories, null, 2)}\n`);

for (const definition of levels) {
  const { files, ...manifest } = definition;
  const levelDir = path.join(challengeRoot, definition.id);
  const environmentDir = path.join(levelDir, "environment");
  await fs.mkdir(environmentDir, { recursive: true });
  await fs.writeFile(path.join(levelDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(environmentDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
}

const sqlitePath = path.join(challengeRoot, "30-sqlite", "environment", "inventory.db");
await fs.rm(sqlitePath, { force: true });
const database = new DatabaseSync(sqlitePath);
database.exec("CREATE TABLE hosts (id INTEGER PRIMARY KEY, hostname TEXT NOT NULL, role TEXT NOT NULL)");
const insert = database.prepare("INSERT INTO hosts (hostname, role) VALUES (?, ?)");
insert.run("web-01", "web");
insert.run("db-01", "database");
insert.run("ops-01", "operations");
database.close();

console.log(`Generated ${levels.length} challenge folders in ${challengeRoot}`);
