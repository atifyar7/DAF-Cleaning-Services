// Starts the private local development database on port 5544. Keep this running while you work.
import { spawn } from "node:child_process";

const binary = "C:/Program Files/PostgreSQL/18/bin/postgres.exe";
const args = ["-D", ".local/pg", "-p", "5544", "-c", "listen_addresses=127.0.0.1"];

spawn(binary, args, { stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 0));
