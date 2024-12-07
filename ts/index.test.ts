import { describe, expect, it } from "vitest";
import { type Entry, Invalid, parse } from "./index.js";

const ESC = "\x1b";
const OSC633 = `${ESC}]633;`;
const ST = "\x07";

const A = `${OSC633}A${ST}`;
const B = `${OSC633}B${ST}`;
const C = `${OSC633}C${ST}`;

function D(exitCode?: string): string {
	return `${OSC633}D${exitCode ? `;${exitCode}` : ""}${ST}`;
}

function E(command: string, nonce?: string): string {
	return `${OSC633}E;${command}${nonce ? `;${nonce}` : ""}${ST}`;
}

function P(name: string, value: string): string {
	return `${OSC633}P;${name}=${value}${ST}`;
}

// Helper function for creating invalid sequences
function InvalidSequence(type: string, params?: string): string {
	return `${OSC633}${type}${params ? `;${params}` : ""}${ST}`;
}

async function parseToArray(input: string[]): Promise<Entry[]> {
	const stream = {
		async *[Symbol.asyncIterator]() {
			for (const chunk of input) {
				yield chunk;
			}
		},
	};
	return Array.fromAsync(parse(stream));
}

describe("parse", () => {
	it("handles all sequence types in a single chunk", async () => {
		const input = [
			[
				A,
				"user@host:~$ ",
				B,
				"echo test",
				E("echo test"),
				C,
				"test\n",
				D("0"),
				P("Cwd", "/home/user"),
			].join(""),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "echo test" },
			{ type: "E", command: "echo test" },
			{ type: "C" },
			{ type: "output", value: "test\n" },
			{ type: "D", exitCode: "0" },
			{ type: "P", name: "Cwd", value: "/home/user" },
		]);
	});

	it("handles a complete command execution sequence", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			"echo test",
			E("echo test"),
			C,
			"test\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "echo test" },
			{ type: "E", command: "echo test" },
			{ type: "C" },
			{ type: "output", value: "test\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles command execution sequence without exit code", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			"echo test",
			E("echo test"),
			C,
			"test\n",
			D(),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "echo test" },
			{ type: "E", command: "echo test" },
			{ type: "C" },
			{ type: "output", value: "test\n" },
			{ type: "D", exitCode: undefined },
		]);
	});

	it("handles multiple commands in sequence", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			"echo first",
			E("echo first"),
			C,
			"first\n",
			D("0"),
			A,
			"user@host:~$ ",
			B,
			"echo second",
			E("echo second"),
			C,
			"second\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "echo first" },
			{ type: "E", command: "echo first" },
			{ type: "C" },
			{ type: "output", value: "first\n" },
			{ type: "D", exitCode: "0" },
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "echo second" },
			{ type: "E", command: "echo second" },
			{ type: "C" },
			{ type: "output", value: "second\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles command with error exit code", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			"invalid-command",
			E("invalid-command"),
			C,
			"command not found\n",
			D("127"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "invalid-command" },
			{ type: "E", command: "invalid-command" },
			{ type: "C" },
			{ type: "output", value: "command not found\n" },
			{ type: "D", exitCode: "127" },
		]);
	});

	it("handles property updates", async () => {
		const input = [P("Cwd", "/home/user"), P("IsWindows", "False")];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "P", name: "Cwd", value: "/home/user" },
			{ type: "P", name: "IsWindows", value: "False" },
		]);
	});

	it("handles property update with empty value", async () => {
		const input = [P("TestKey", "")];

		const results = await parseToArray(input);

		expect(results).toEqual([{ type: "P", name: "TestKey", value: "" }]);
	});

	it("handles property update with equals sign in value", async () => {
		const input = [P("TestKey", "value=with=equals=signs")];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "P", name: "TestKey", value: "value=with=equals=signs" },
		]);
	});

	it("handles escaped characters in property values", async () => {
		const input = [
			P("Cwd", "/path\\x3bwith\\x0asemicolon\\\\and\\\\backslash"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{
				type: "P",
				name: "Cwd",
				value: "/path;with\nsemicolon\\and\\backslash",
			},
		]);
	});

	it("preserves whitespace between sequences", async () => {
		const input = [D("0"), "\n  \t  \n", A];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "D", exitCode: "0" },
			{ type: "output", value: "\n  \t  \n" },
			{ type: "A" },
		]);
	});

	it("handles multiline command output", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			"ls",
			E("ls"),
			C,
			"file1\n  file2  \nfile3\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "ls" },
			{ type: "E", command: "ls" },
			{ type: "C" },
			{ type: "output", value: "file1\n  file2  \nfile3\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles partial sequences across chunks", async () => {
		const input = [`before ${ESC}`, "]633", `;A${ST} after`];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "output", value: "before " },
			{ type: "A" },
			{ type: "output", value: " after" },
		]);
	});

	it("handles command with nonce", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			"echo test",
			E("echo test", "abc123"),
			C,
			"test\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: "echo test" },
			{ type: "E", command: "echo test", nonce: "abc123" },
			{ type: "C" },
			{ type: "output", value: "test\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles escaped characters in command", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			'echo "hello; world"',
			E('echo "hello\\x3b world"'),
			C,
			"hello; world\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: 'echo "hello; world"' },
			{ type: "E", command: 'echo "hello; world"' },
			{ type: "C" },
			{ type: "output", value: "hello; world\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles escaped backslash in command", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			'echo "\\test"',
			E('echo "\\\\test"'),
			C,
			"\\test\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: 'echo "\\test"' },
			{ type: "E", command: 'echo "\\test"' },
			{ type: "C" },
			{ type: "output", value: "\\test\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles escaped newline in command", async () => {
		const input = [
			A,
			"user@host:~$ ",
			B,
			'echo "hello\nworld"',
			E('echo "hello\\x0aworld"'),
			C,
			"hello\nworld\n",
			D("0"),
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "A" },
			{ type: "output", value: "user@host:~$ " },
			{ type: "B" },
			{ type: "output", value: 'echo "hello\nworld"' },
			{ type: "E", command: 'echo "hello\nworld"' },
			{ type: "C" },
			{ type: "output", value: "hello\nworld\n" },
			{ type: "D", exitCode: "0" },
		]);
	});

	it("handles multiple sequences in large chunks", async () => {
		const largeText = "x".repeat(4096);
		const input = [
			`${largeText}${ESC}]633;A${ST}`,
			`${ESC}]633;B${ST}${largeText}`,
		];

		const results = await parseToArray(input);

		expect(results).toEqual([
			{ type: "output", value: largeText },
			{ type: "A" },
			{ type: "B" },
			{ type: "output", value: largeText },
		]);
	});

	describe("invalid sequences", () => {
		it("reports E-type sequence without command", async () => {
			const input = ["before", InvalidSequence("E"), "after"];

			const results = await parseToArray(input);
			const error = results[1] as Invalid;

			expect(results).toHaveLength(3);
			expect(results[0]).toEqual({ type: "output", value: "before" });
			expect(error).toBeInstanceOf(Invalid);
			expect(error.type).toBe("invalid");
			expect(error.sequence).toBe(InvalidSequence("E"));
			expect(error.message).toBe("Missing command parameter");
			expect(error.oscType).toBe("E");
			expect(error.parts).toEqual(["E"]);
			expect(results[2]).toEqual({ type: "output", value: "after" });
		});

		it("reports P-type sequence without name-value pair", async () => {
			const input = [
				"before",
				InvalidSequence("P"),
				InvalidSequence("P", "invalid"),
				"after",
			];

			const results = await parseToArray(input);
			const error1 = results[1] as Invalid;
			const error2 = results[2] as Invalid;

			expect(results).toHaveLength(4);
			expect(results[0]).toEqual({ type: "output", value: "before" });
			expect(error1).toBeInstanceOf(Invalid);
			expect(error1.type).toBe("invalid");
			expect(error1.sequence).toBe(InvalidSequence("P"));
			expect(error1.message).toBe("Missing name-value parameter");
			expect(error1.oscType).toBe("P");
			expect(error1.parts).toEqual(["P"]);
			expect(error2).toBeInstanceOf(Invalid);
			expect(error2.type).toBe("invalid");
			expect(error2.sequence).toBe(InvalidSequence("P", "invalid"));
			expect(error2.message).toBe("Invalid property format: missing '='");
			expect(error2.oscType).toBe("P");
			expect(error2.parts).toEqual(["P", "invalid"]);
			expect(results[3]).toEqual({ type: "output", value: "after" });
		});

		it("reports P-type sequence with equals but no name", async () => {
			const input = ["before", InvalidSequence("P", "=value"), "after"];

			const results = await parseToArray(input);
			const error = results[1] as Invalid;

			expect(results).toHaveLength(3);
			expect(results[0]).toEqual({ type: "output", value: "before" });
			expect(error).toBeInstanceOf(Invalid);
			expect(error.type).toBe("invalid");
			expect(error.sequence).toBe(InvalidSequence("P", "=value"));
			expect(error.message).toBe("Missing property name");
			expect(error.oscType).toBe("P");
			expect(error.parts).toEqual(["P", "=value"]);
			expect(results[2]).toEqual({ type: "output", value: "after" });
		});

		it("reports unknown sequence type", async () => {
			const input = ["before", InvalidSequence("X", "something"), "after"];

			const results = await parseToArray(input);
			const error = results[1] as Invalid;

			expect(results).toHaveLength(3);
			expect(results[0]).toEqual({ type: "output", value: "before" });
			expect(error).toBeInstanceOf(Invalid);
			expect(error.type).toBe("invalid");
			expect(error.sequence).toBe(InvalidSequence("X", "something"));
			expect(error.message).toBe("Unknown sequence type: X");
			expect(error.oscType).toBe("X");
			expect(error.parts).toEqual(["X", "something"]);
			expect(results[2]).toEqual({ type: "output", value: "after" });
		});
	});
});
