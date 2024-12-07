import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { type Entry, parse } from "./index.js";

describe("OSC 633 Parser Examples", () => {
	// Basic usage: Parse from an AsyncGenerator
	it("basic usage", async () => {
		// Create an AsyncGenerator that yields input strings
		async function* stream(): AsyncGenerator<string> {
			yield "\x1b]633;A\x07"; // Prompt start
			yield "user@host:~$ "; // Prompt string
			yield "\x1b]633;B\x07"; // Prompt end
			yield "echo hello"; // Command string
			yield "\x1b]633;E;echo hello\x07"; // Command line
			yield "\x1b]633;C\x07"; // Command execution start
			yield "hello\n"; // Command output
			yield "\x1b]633;D;0\x07"; // Command end (exit code 0)
		}

		// Parse and convert to Entry array
		const entries: Entry[] = [];
		for await (const entry of parse(stream())) {
			entries.push(entry);
		}

		// Verify results
		expect(entries).toEqual([
			{ type: "A" }, // Prompt start
			{ type: "output", value: "user@host:~$ " }, // Prompt string
			{ type: "B" }, // Prompt end
			{ type: "output", value: "echo hello" }, // Command string
			{ type: "E", command: "echo hello" }, // Command line
			{ type: "C" }, // Command execution start
			{ type: "output", value: "hello\n" }, // Command output
			{ type: "D", exitCode: "0" }, // Command end
		]);
	});

	// Example of parsing from ReadableStream (which implements AsyncIterable)
	it("parse from ReadableStream", async () => {
		// Create a ReadableStream that implements AsyncIterable
		// Bun doesn't support ReadableStream.from, so we create a ReadableStream instance directly: [Support `ReadableStream.from()` · Issue #3700 · oven-sh/bun](https://github.com/oven-sh/bun/issues/3700)
		const stream = new ReadableStream<string>({
			async start(controller) {
				const chunks = [
					"\x1b]633;A\x07", // Prompt start
					"user@host:~$ ", // Prompt string
					"\x1b]633;B\x07", // Prompt end
					"ls\n", // Command string
					"\x1b]633;E;ls\x07", // Command line
					"\x1b]633;C\x07", // Command execution start
					"file1.txt\nfile2.txt\n", // Command output
					"\x1b]633;D;0\x07", // Command end
				];

				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			},
		}) as unknown as AsyncIterable<string>;

		// Parse and convert to Entry array
		const entries = await Array.fromAsync(parse(stream));

		// Verify results
		expect(entries).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "ls\n" },
			{ type: "E", command: "ls" },
			{ type: "C" },
			{ type: "output", value: "file1.txt\nfile2.txt\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	// Example of parsing from Node.js Readable stream
	it("parse from Node.js Readable", async () => {
		// Create a Node.js Readable stream
		const stream = Readable.from([
			"\x1b]633;A\x07", // Prompt start
			"user@host:~$ ", // Prompt string
			"\x1b]633;B\x07", // Prompt end
			"pwd\n", // Command string
			"\x1b]633;E;pwd\x07", // Command line
			"\x1b]633;C\x07", // Command execution start
			"/home/user\n", // Command output
			"\x1b]633;D;0\x07", // Command end
		]);

		// Parse and convert to Entry array
		const entries = await Array.fromAsync(parse(stream));

		// Verify results
		expect(entries).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "pwd\n" },
			{ type: "E", command: "pwd" },
			{ type: "C" },
			{ type: "output", value: "/home/user\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	// Example of parsing from custom AsyncIterable
	it("parse from custom AsyncIterable", async () => {
		// Create a custom AsyncIterable
		const stream: AsyncIterable<string> = {
			async *[Symbol.asyncIterator]() {
				const chunks = [
					"\x1b]633;A\x07", // Prompt start
					"user@host:~$ ", // Prompt string
					"\x1b]633;B\x07", // Prompt end
					"cat file.txt\n", // Command string
					"\x1b]633;E;cat file.txt\x07", // Command line
					"\x1b]633;C\x07", // Command execution start
					"Hello from file!\n", // Command output
					"\x1b]633;D;0\x07", // Command end
				];

				for (const chunk of chunks) {
					yield chunk;
				}
			},
		};

		// Parse and convert to Entry array
		const entries = await Array.fromAsync(parse(stream));

		// Verify results
		expect(entries).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "cat file.txt\n" },
			{ type: "E", command: "cat file.txt" },
			{ type: "C" },
			{ type: "output", value: "Hello from file!\n" },
			{ type: "D", exitCode: "0" },
		]);
	});
});
