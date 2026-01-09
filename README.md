# Quark CLI

Quark CLI is a command-line interface tool for compiling Sciter applications into executable binaries for various platforms.

## Description

Quark CLI simplifies the process of building Sciter-based desktop applications. It takes your project configuration and resources, compiles them into optimized executables, and supports cross-platform builds for Windows, macOS, and Linux.

## Features

- Cross-platform compilation (Windows x64, macOS, Linux)
- Simple command-line interface
- Project-based configuration via JSON files
- Integration with Sciter's build tools

## Installation

1. Ensure you have [Sciter](https://sciter.com/) installed on your system.
2. Clone this repository:
   ```bash
   git clone https://github.com/d-mb/quark-cli.git
   cd quark-cli
   ```
3. Build the CLI tool:
   ```bash
   task build
   ```
   This will generate the executable in the `bin/` directory.

## Usage

### Basic Usage

Run the CLI with your project configuration:

```bash
scapp.exe src/main.htm --config project.json
```

### Command-Line Options

- `--project <id|name>`: Load a project from saved settings
- `--config <file>`: Specify a project JSON file
- `--exe <name>`: Set the executable name
- `--resources <path>`: Path to application resources
- `--out <path>`: Output directory for built executables
- `--logo <file>`: Path to application icon
- `--targets <list>`: Comma-separated list of target platforms (e.g., winX64,mac)
- `--silent`: Run in silent mode

### Example

```bash
scapp.exe src/main.htm --exe myapp --resources src --out dist --targets winX64 --logo icon.svg
```

## Building Your Own Projects

1. Create a `project.json` file with your application configuration.
2. Organize your resources in a directory (HTML, CSS, JS files).
3. Run the CLI with your configuration.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Attribution

This CLI tool is based on the original Quark implementation from the [Sciter JS SDK](https://gitlab.com/sciter-engine/sciter-js-sdk/-/tree/main/quark).