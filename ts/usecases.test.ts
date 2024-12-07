import { describe, expect, it } from "vitest";
import { parse } from "./index.js";

describe("OSC 633 Parser Use Cases", () => {
	// Command History Recording
	it("records command history with timestamps", async () => {
		// Create an AsyncGenerator that yields input strings
		async function* stream(): AsyncGenerator<string> {
			yield "\x1b]633;A\x07"; // Prompt start
			yield "user@host:~$ "; // Prompt string
			yield "\x1b]633;B\x07"; // Prompt end
			yield "echo first"; // Command string
			yield "\x1b]633;E;echo first\x07"; // Command line
			yield "\x1b]633;C\x07"; // Command execution start
			yield "first\n"; // Command output
			yield "\x1b]633;D;0\x07"; // Command end
			yield "\x1b]633;A\x07"; // Next prompt start
			yield "user@host:~$ "; // Next prompt string
			yield "\x1b]633;B\x07"; // Next prompt end
			yield "echo second"; // Next command string
			yield "\x1b]633;E;echo second\x07"; // Next command line
			yield "\x1b]633;C\x07"; // Next command execution start
			yield "second\n"; // Next command output
			yield "\x1b]633;D;0\x07"; // Next command end
		}

		// Record command history with timestamps
		const history: { command: string; timestamp: Date }[] = [];
		for await (const entry of parse(stream())) {
			if (entry.type === "E") {
				history.push({
					command: entry.command,
					timestamp: new Date(),
				});
			}
		}

		// Verify results
		expect(history).toHaveLength(2);
		expect(history[0]?.command).toBe("echo first");
		expect(history[0]?.timestamp).toBeInstanceOf(Date);
		expect(history[1]?.command).toBe("echo second");
		expect(history[1]?.timestamp).toBeInstanceOf(Date);
	});

	// Command Output Collection
	it("collects command output with success status", async () => {
		// Create an AsyncGenerator that yields input strings
		async function* stream(): AsyncGenerator<string> {
			yield "\x1b]633;A\x07"; // Prompt start
			yield "user@host:~$ "; // Prompt string
			yield "\x1b]633;B\x07"; // Prompt end
			yield "ls\n"; // Command string
			yield "\x1b]633;E;ls\x07"; // Command line
			yield "\x1b]633;C\x07"; // Command execution start
			yield "file1.txt\n"; // Command output
			yield "file2.txt\n"; // More command output
			yield "\x1b]633;D;0\x07"; // Command end (success)
			yield "\x1b]633;A\x07"; // Next prompt start
			yield "user@host:~$ "; // Next prompt string
			yield "\x1b]633;B\x07"; // Next prompt end
			yield "invalid-command\n"; // Next command string
			yield "\x1b]633;E;invalid-command\x07"; // Next command line
			yield "\x1b]633;C\x07"; // Next command execution start
			yield "command not found\n"; // Next command output
			yield "\x1b]633;D;127\x07"; // Next command end (failure)
		}

		// Collect command output
		const successfulOutputs: string[] = [];
		let currentOutput = "";
		let isCollecting = false;

		for await (const entry of parse(stream())) {
			if (entry.type === "C") {
				isCollecting = true;
			} else if (entry.type === "D") {
				if (entry.exitCode === "0") {
					successfulOutputs.push(currentOutput);
				}
				currentOutput = "";
				isCollecting = false;
			} else if (entry.type === "output" && isCollecting) {
				currentOutput += entry.value;
			}
		}

		// Verify results
		expect(successfulOutputs).toHaveLength(1);
		expect(successfulOutputs[0]).toBe("file1.txt\nfile2.txt\n");
	});

	// Working Directory Tracking
	it("tracks working directory changes", async () => {
		// Create an AsyncGenerator that yields input strings
		async function* stream(): AsyncGenerator<string> {
			yield "\x1b]633;A\x07"; // Prompt start
			yield "user@host:~$ "; // Prompt string
			yield "\x1b]633;B\x07"; // Prompt end
			yield "cd /home/user"; // Command string
			yield "\x1b]633;E;cd /home/user\x07"; // Command line
			yield "\x1b]633;C\x07"; // Command execution start
			yield "\x1b]633;P;Cwd=/home/user\x07"; // Working directory update
			yield "\x1b]633;D;0\x07"; // Command end
			yield "\x1b]633;A\x07"; // Next prompt start
			yield "user@host:~/projects$ "; // Next prompt string
			yield "\x1b]633;B\x07"; // Next prompt end
			yield "cd web-app"; // Next command string
			yield "\x1b]633;E;cd web-app\x07"; // Next command line
			yield "\x1b]633;C\x07"; // Next command execution start
			yield "\x1b]633;P;Cwd=/home/user/projects/web-app\x07"; // Next working directory update
			yield "\x1b]633;D;0\x07"; // Next command end
		}

		// Track working directory changes
		const directories: string[] = [];
		for await (const entry of parse(stream())) {
			if (entry.type === "P" && entry.name === "Cwd") {
				directories.push(entry.value);
			}
		}

		// Verify results
		expect(directories).toHaveLength(2);
		expect(directories[0]).toBe("/home/user");
		expect(directories[1]).toBe("/home/user/projects/web-app");
	});
});
