const ESC = "\x1b";
const OSC633_START = `${ESC}]633;`;
const ST = "\x07"; // String Terminator (BEL)

// OSC 633 types
const A = "A";
const B = "B";
const C = "C";
const D = "D";
const E = "E";
const P = "P";

type A = typeof A;
type B = typeof B;
type C = typeof C;
type D = typeof D;
type E = typeof E;
type P = typeof P;

export type PromptStart = {
	type: A;
};

export type PromptEnd = {
	type: B;
};

export type CommandStart = {
	type: C;
};

export type CommandEnd = {
	type: D;
	exitCode?: undefined | string;
};

export type CommandLine = {
	type: E;
	command: string;
	nonce?: undefined | string;
};

export type PropertyUpdate = {
	type: P;
	name: string;
	value: string;
};

export type Output = {
	type: "output";
	value: string;
};

export class Invalid extends Error {
	readonly type = "invalid" as const;
	readonly sequence: string;
	readonly oscType: string;
	readonly parts: string[];

	constructor(parts: string[], message: string) {
		super(message);
		this.sequence = `${OSC633_START}${parts.join(";")}${ST}`;
		this.oscType = parts[0] ?? "";
		this.parts = parts;
		this.name = "Invalid";
	}
}

export type Entry =
	| PromptStart
	| PromptEnd
	| CommandStart
	| CommandEnd
	| CommandLine
	| PropertyUpdate
	| Output
	| Invalid;

function createOutput(value: string): Output {
	return { type: "output", value };
}

function unescapeValue(value: string): string {
	return value
		.replace(/\\x3b/g, ";")
		.replace(/\\x0a/g, "\n")
		.replace(/\\\\/g, "\\");
}

function parseCommandEnd(parts: string[]): CommandEnd {
	return {
		type: D,
		exitCode: parts[1],
	};
}

function parseCommandLine(parts: string[]): CommandLine | Invalid {
	const command = parts[1];
	if (command === undefined) {
		return new Invalid(parts, "Missing command parameter");
	}
	return {
		type: E,
		command: unescapeValue(command),
		nonce: parts[2],
	};
}

function parsePropertyUpdate(parts: string[]): PropertyUpdate | Invalid {
	const propertyPart = parts[1];
	if (propertyPart === undefined) {
		return new Invalid(parts, "Missing name-value parameter");
	}
	const equalIndex = propertyPart.indexOf("=");
	if (equalIndex === -1) {
		return new Invalid(parts, "Invalid property format: missing '='");
	}
	const name = propertyPart.slice(0, equalIndex);
	if (!name) {
		return new Invalid(parts, "Missing property name");
	}
	const value = propertyPart.slice(equalIndex + 1);
	return {
		type: P,
		name,
		value: unescapeValue(value),
	};
}

function parseSequence(sequence: string): Entry {
	const parts = sequence.split(";");
	const type = parts[0];

	switch (type) {
		case A:
			return { type: A };
		case B:
			return { type: B };
		case C:
			return { type: C };
		case D:
			return parseCommandEnd(parts);
		case E:
			return parseCommandLine(parts);
		case P:
			return parsePropertyUpdate(parts);
		default:
			return new Invalid(parts, `Unknown sequence type: ${type}`);
	}
}

function isPartialOSC633Start(str: string): boolean {
	const prefix = OSC633_START.slice(0, str.length);
	return str === prefix;
}

export async function* parse(
	stream: AsyncIterable<string>,
): AsyncGenerator<Entry> {
	let buffer = "";
	let outputBuffer = "";

	for await (const chunk of stream) {
		buffer += chunk;

		while (buffer.length > 0) {
			const escIndex = buffer.indexOf(ESC);
			if (escIndex === -1) {
				outputBuffer += buffer;
				buffer = "";
				break;
			}

			// Check sequence start
			const remaining = buffer.slice(escIndex);
			if (!remaining.startsWith(OSC633_START)) {
				// Check for potential partial OSC633 sequence
				if (isPartialOSC633Start(remaining)) {
					if (escIndex > 0) {
						outputBuffer += buffer.slice(0, escIndex);
					}
					buffer = buffer.slice(escIndex);
					break;
				}

				outputBuffer += buffer.slice(0, escIndex + 1);
				buffer = buffer.slice(escIndex + 1);
				continue;
			}

			// Find sequence terminator
			const stIndex = buffer.indexOf(ST, escIndex);
			if (stIndex === -1) {
				if (escIndex > 0) {
					outputBuffer += buffer.slice(0, escIndex);
				}
				buffer = buffer.slice(escIndex);
				break;
			}

			// Output text before sequence
			if (escIndex > 0) {
				outputBuffer += buffer.slice(0, escIndex);
			}

			// Output if output buffer has accumulated
			if (outputBuffer.length > 0) {
				yield createOutput(outputBuffer);
				outputBuffer = "";
			}

			// Parse sequence
			const sequence = buffer.slice(escIndex + OSC633_START.length, stIndex);
			yield parseSequence(sequence);

			// Update remaining buffer
			buffer = buffer.slice(stIndex + 1);
		}
	}

	// Output remaining buffer
	if (outputBuffer.length > 0 || buffer.length > 0) {
		yield createOutput(outputBuffer + buffer);
	}
}
