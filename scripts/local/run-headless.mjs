#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const stateDir = path.join(rootDir, ".local");
const logDir = path.join(stateDir, "logs");
const pidDir = path.join(stateDir, "run");

const [operation, name, ...rawCommand] = process.argv.slice(2);

if (!operation || !name || !["start", "stop", "restart", "status"].includes(operation)) {
  usage();
  process.exitCode = 2;
} else if (operation === "start" || operation === "restart") {
  const command = rawCommand[0] === "--" ? rawCommand.slice(1) : rawCommand;
  if (command.length === 0) {
    throw new Error("A command is required when starting a headless process.");
  }
  if (operation === "restart") stop(name);
  start(name, command);
} else if (operation === "stop") {
  stop(name);
} else {
  status(name);
}

function start(processName, command) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(pidDir, { recursive: true });

  const pidPath = getPidPath(processName);
  const existingPid = readPid(pidPath);
  if (existingPid && isRunning(existingPid)) {
    console.log(`${processName} is already running (pid ${existingPid}).`);
    return;
  }

  const logPath = getLogPath(processName);
  const log = fs.openSync(logPath, "a");
  fs.appendFileSync(logPath, `\n${new Date().toISOString()} starting: ${command.join(" ")}\n`);

  const child = spawn(command[0], command.slice(1), {
    cwd: rootDir,
    detached: true,
    env: process.env,
    stdio: ["ignore", log, log],
  });
  child.unref();
  fs.closeSync(log);
  fs.writeFileSync(pidPath, `${child.pid}\n`);
  console.log(`Started ${processName} (pid ${child.pid}). Logs: ${logPath}`);
}

function stop(processName) {
  const pidPath = getPidPath(processName);
  const pid = readPid(pidPath);
  if (!pid || !isRunning(pid)) {
    fs.rmSync(pidPath, { force: true });
    console.log(`${processName} is not running.`);
    return;
  }

  process.kill(pid, "SIGTERM");
  fs.rmSync(pidPath, { force: true });
  console.log(`Stopped ${processName} (pid ${pid}).`);
}

function status(processName) {
  const pid = readPid(getPidPath(processName));
  console.log(
    pid && isRunning(pid)
      ? `${processName} is running (pid ${pid}). Logs: ${getLogPath(processName)}`
      : `${processName} is stopped. Logs: ${getLogPath(processName)}`,
  );
}

function getPidPath(processName) {
  return path.join(pidDir, `${processName}.pid`);
}

function getLogPath(processName) {
  return path.join(logDir, `${processName}.log`);
}

function readPid(pidPath) {
  if (!fs.existsSync(pidPath)) return null;
  const pid = Number(fs.readFileSync(pidPath, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function usage() {
  console.error("Usage: run-headless.mjs <start|stop|restart|status> <name> [-- command args...]");
  console.error(`State directory: ${stateDir} (${os.platform()})`);
}
