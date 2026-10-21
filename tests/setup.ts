import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "maison-test-")), "maison.db");
process.env.MAISON_DB_PATH = dbPath;
