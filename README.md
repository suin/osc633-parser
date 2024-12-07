# OSC 633 Parser

[![CI](https://github.com/suin/osc633-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/suin/osc633-parser/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@suin%2Fosc633-parser.svg)](https://badge.fury.io/js/@suin%2Fosc633-parser)
[![Node.js Version](https://img.shields.io/node/v/@suin/osc633-parser)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-Runtime-black)](https://bun.sh)
[![npm downloads](https://img.shields.io/npm/dw/@suin/osc633-parser)](https://www.npmjs.com/package/@suin/osc633-parser)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@suin/osc633-parser)](https://bundlephobia.com/package/@suin/osc633-parser)
[![Biome](https://img.shields.io/badge/formatter-biome-F7B911)](https://biomejs.dev)

A Node.js library that parses Operating System Command (OSC) 633 sequences from any AsyncIterable string source. These sequences were originally designed by VS Code for its terminal shell integration feature.

## Installation

```bash
npm install @suin/osc633-parser
```

**Runtime Requirements:**
- Node.js >= 22.0.0

**Development Requirements:**
- [Bun](https://bun.sh) runtime

> ⚠️ This package is currently in alpha stage (v0.0.0-alpha1)

## What is Terminal Integration in VS Code?

VS Code's integrated terminal provides rich features like:
- Command execution tracking
- Proper prompt detection
- Working directory awareness
- Shell state management

To enable these features, VS Code uses special escape sequences called "OSC 633" (Operating System Command). These sequences are embedded in the terminal output to mark different states and events.

## What are OSC 633 Sequences?

OSC 633 sequences are a set of terminal control sequences that follow the format:

```
ESC ] 633 ; TYPE [; PARAMS] ST
```

Where:
- `ESC` is the escape character (`\x1b`)
- `]` marks the start of an OSC sequence
- `633` is the sequence identifier
- `TYPE` is a single character indicating the sequence type
- `PARAMS` are optional parameters specific to each type
- `ST` is the string terminator (`\x07`, also known as BEL)

### Sequence Types

The following sequence types are supported:

#### A - Prompt Start
```
\x1b]633;A\x07
```
Marks the beginning of a shell prompt. This helps identify where each prompt begins in the terminal output.

#### B - Prompt End
```
\x1b]633;B\x07
```
Marks the end of a shell prompt. The text between A and B sequences is the actual prompt text (e.g., "user@host:~$ ").

#### E - Command Line
```
\x1b]633;E;command[;nonce]\x07
```
Explicitly sets the command line with an optional nonce. The command value may contain escaped characters:

- Semicolon must be escaped as `\x3b`
- Newline must be escaped as `\x0a`
- Backslash must be escaped as `\\`

Examples:
```
echo "hello; world"  -> echo "hello\x3b world"
echo "hello\nworld"  -> echo "hello\x0aworld"
echo "hello\world"   -> echo "hello\\world"
```

#### C - Command Start
```
\x1b]633;C\x07
```
Marks the start of command execution. This is emitted right before the shell starts executing a command.

#### D - Command End
```
\x1b]633;D[;exitcode]\x07
```
Marks the end of command execution. Includes an optional exit code:
- `\x1b]633;D;0\x07` - Command succeeded (exit code 0)
- `\x1b]633;D;1\x07` - Command failed (exit code 1)
- `\x1b]633;D;127\x07` - Command not found

#### P - Property Update
```
\x1b]633;P;name=value\x07
```
Sets a terminal property. Known properties include:
- `Cwd` - Current working directory
  ```
  \x1b]633;P;Cwd=/home/user\x07
  ```
- `IsWindows` - Whether using Windows backend
  ```
  \x1b]633;P;IsWindows=True\x07
  ```

The property value follows the same escaping rules as command values:
```
Cwd=/path;with;semicolon -> Cwd=/path\x3bwith\x3bsemicolon
Cwd=/path\n/newline      -> Cwd=/path\x0a/newline
Cwd=/path\/backslash     -> Cwd=/path\\/backslash
```

### Example Terminal Output

Here's what a typical terminal session looks like with these sequences:

```
\x1b]633;A\x07                    # Prompt starts
user@host:~$ \x1b]633;B\x07       # Prompt ends
echo "hello; world"\              # User types command
\x1b]633;E;echo "hello\x3b world"\x07  # Shell reports command
\x1b]633;C\x07                    # Command execution starts
hello; world\n                    # Command output
\x1b]633;D;0\x07                  # Command ends successfully
```

## Usage

The parser accepts any `AsyncIterable<string>` as input. For complete examples of basic usage and different input sources (AsyncGenerator, ReadableStream, Node.js Readable stream, and custom AsyncIterable), see [ts/example.test.ts](ts/example.test.ts).

Here's a basic example:

```typescript
import { parse, type Entry } from "@suin/osc633-parser";

// Create an AsyncIterable that yields input strings
async function* stream() {
  yield "\x1b]633;A\x07";        // Prompt start
  yield "user@host:~$ ";         // Prompt string
  yield "\x1b]633;B\x07";        // Prompt end
  yield "echo hello";            // Command string
  yield "\x1b]633;E;echo hello\x07"; // Command line
  yield "\x1b]633;C\x07";        // Command execution start
  yield "hello\n";               // Command output
  yield "\x1b]633;D;0\x07";      // Command end (exit code 0)
}

// Parse and process entries
for await (const entry of parse(stream())) {
  switch (entry.type) {
    case "A":
      console.log("Prompt start");
      break;
    case "B":
      console.log("Prompt end");
      break;
    case "C":
      console.log("Command execution start");
      break;
    case "D":
      console.log(`Command finished with exit code: ${entry.exitCode}`);
      break;
    case "E":
      console.log(`Command executed: ${entry.command}`);
      break;
    case "P":
      console.log(`Property ${entry.name} = ${entry.value}`);
      break;
    case "output":
      console.log(`Text: ${entry.value}`);
      break;
    case "invalid":
      console.error(`Invalid sequence: ${entry.message}`);
      break;
  }
}
```

## Entry Types

The parser emits these entry types:

```typescript
type Entry =
  | PromptStart      // { type: "A" }
  | PromptEnd        // { type: "B" }
  | CommandStart     // { type: "C" }
  | CommandEnd       // { type: "D"; exitCode?: string }
  | CommandLine      // { type: "E"; command: string; nonce?: string }
  | PropertyUpdate   // { type: "P"; name: string; value: string }
  | Output          // { type: "output"; value: string }
  | Invalid;        // Error for invalid sequences
```

### Invalid Sequences

When an invalid sequence is encountered, the parser emits an Invalid entry:

```typescript
class Invalid extends Error {
  readonly type = "invalid";
  readonly sequence: string;    // The full invalid sequence
  readonly oscType: string;     // The sequence type
  readonly parts: string[];     // Sequence parts after splitting
  readonly message: string;     // Error description
  readonly name = "Invalid";    // Error class name
}
```

Examples of invalid sequences:
- E-type without command: `\x1b]633;E\x07`
- P-type without name-value: `\x1b]633;P\x07`
- Unknown sequence type: `\x1b]633;X\x07`

## Use Cases

For complete examples of the following use cases with test data and assertions, see [ts/usecases.test.ts](ts/usecases.test.ts).

1. **Command History Recording**
   ```typescript
   for await (const entry of parse(stream)) {
     if (entry.type === "E") {
       history.push({
         command: entry.command,
         timestamp: new Date()
       });
     }
   }
   ```

2. **Command Output Collection**
   ```typescript
   let output = "";
   let isCollecting = false;
   for await (const entry of parse(stream)) {
     if (entry.type === "C") {
       isCollecting = true;
     } else if (entry.type === "D") {
       if (entry.exitCode === "0") {
         console.log("Command output:", output);
       }
       output = "";
       isCollecting = false;
     } else if (entry.type === "output" && isCollecting) {
       output += entry.value;
     }
   }
   ```

3. **Working Directory Tracking**
   ```typescript
   for await (const entry of parse(stream)) {
     if (entry.type === "P" && entry.name === "Cwd") {
       console.log("Current directory:", entry.value);
     }
   }
   ```

## Test Code as Documentation

This project uses test files as living documentation to help you understand and use the library:

1. **[ts/example.test.ts](ts/example.test.ts)** - Ready-to-use code examples showing:
   - Basic usage with AsyncGenerator
   - ReadableStream integration
   - Node.js Readable stream usage
   - Custom AsyncIterable implementation

2. **[ts/usecases.test.ts](ts/usecases.test.ts)** - Practical use cases you can copy and adapt:
   - Command history recording
   - Output collection
   - Working directory tracking

3. **[ts/index.test.ts](ts/index.test.ts)** - Detailed specifications covering:
   - All sequence types and their variations
   - Command execution sequences
   - Property updates with various values
   - Error cases and invalid sequences
   - Escaped character handling

## Design Decisions

1. **Sequence-Based Processing**
   - Processes input by finding and extracting complete sequences
   - Uses buffer to accumulate partial input
   - Emits non-sequence text as Output entries
   - Ensures reliable sequence detection with `isPartialOSC633Start`
   - Handles split sequences across chunks efficiently

2. **Efficient Buffering**
   - Maintains a single buffer for incoming chunks
   - Processes buffer until no more complete sequences found
   - Preserves partial sequences for next chunk
   - Handles split sequences across chunks
   - Emits text before sequences to maintain order

3. **Robust Error Handling**
   - Validates sequence format and parameters
   - Reports invalid sequences with detailed error information
   - Continues processing after invalid sequences
   - Preserves original sequence in error reports

4. **Value Unescaping**
   - Automatically unescapes values in both command (E) and property (P) sequences
   - Handles three escape patterns:
     * `\x3b` -> semicolon (;)
     * `\x0a` -> newline (\n)
     * `\\` -> backslash (\)
   - Uses consistent unescaping across sequence types
   - Maintains original value integrity

## Development

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

### Running Tests

```bash
bun run test
```

### Building

```bash
bun run build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## References

- [VS Code Terminal Shell Integration Documentation](https://github.com/microsoft/vscode-docs/blob/27e6951b86c69326ee8ff76ba46694a60b72ec65/docs/terminal/shell-integration.md#supported-escape-sequences) - Official documentation of supported escape sequences
