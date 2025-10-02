// src/services/tools.ts
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { findRoot } from "../core/root.js";

/**
 * Tool definitions for structured tool calling
 */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file in the project. Use this to examine existing code, configuration, or documentation.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file from project root (e.g., 'src/index.ts', 'package.json')"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new file or completely overwrite an existing file with new content. Use this for creating new files or replacing file contents entirely.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path where the file should be created/written"
          },
          content: {
            type: "string",
            description: "Complete content to write to the file"
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit an existing file by replacing specific content. Use this for targeted updates to existing files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file to edit"
          },
          old_content: {
            type: "string",
            description: "Exact content to find and replace (must match exactly)"
          },
          new_content: {
            type: "string",
            description: "New content to replace the old content with"
          }
        },
        required: ["path", "old_content", "new_content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in the project directory. Useful for exploring the project structure.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Optional glob pattern to filter files (e.g., '*.ts', 'src/**/*.js')"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "exec_command",
      description: "Execute a shell command in the project directory. Use for running builds, tests, or other scripts.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute (must be in the allowlist)"
          }
        },
        required: ["command"]
      }
    }
  }
];

/**
 * Tool executor - executes tool calls and returns results
 */
export async function executeTool(
  cwd: string,
  toolName: string,
  args: any,
  allowlist: string[]
): Promise<{ success: boolean; result?: string; error?: string }> {
  try {
    const root = await findRoot(cwd) || cwd;

    switch (toolName) {
      case "read_file": {
        const filePath = path.join(root, args.path);
        if (!filePath.startsWith(root)) {
          return { success: false, error: "Path outside project root" };
        }
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "File not found" };
        }
        const content = fs.readFileSync(filePath, "utf-8");
        return { success: true, result: content };
      }

      case "write_file": {
        const filePath = path.join(root, args.path);
        if (!filePath.startsWith(root)) {
          return { success: false, error: "Path outside project root" };
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, args.content, "utf-8");
        return { success: true, result: `File written: ${args.path}` };
      }

      case "edit_file": {
        const filePath = path.join(root, args.path);
        if (!filePath.startsWith(root)) {
          return { success: false, error: "Path outside project root" };
        }
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "File not found" };
        }
        const current = fs.readFileSync(filePath, "utf-8");
        if (!current.includes(args.old_content)) {
          return { success: false, error: "Content to replace not found in file" };
        }
        const updated = current.replace(args.old_content, args.new_content);
        fs.writeFileSync(filePath, updated, "utf-8");
        return { success: true, result: `File edited: ${args.path}` };
      }

      case "list_files": {
        const ignore = new Set(["node_modules", ".git", ".af", "dist", "build"]);
        const files: string[] = [];

        function walk(dir: string, depth = 0) {
          if (depth > 10 || files.length > 500) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ignore.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            const rel = path.relative(root, full);
            if (entry.isDirectory()) {
              walk(full, depth + 1);
            } else {
              if (!args.pattern || rel.includes(args.pattern)) {
                files.push(rel);
              }
            }
          }
        }

        walk(root);
        return { success: true, result: files.join("\n") };
      }

      case "exec_command": {
        const cmd = args.command;
        const bin = cmd.split(/\s+/)[0];

        if (allowlist.length > 0 && !allowlist.includes(bin)) {
          return {
            success: false,
            error: `Command '${bin}' not in allowlist. Add it to .af/config.yml -> shellAllowlist`
          };
        }

        const result = await execa(cmd, {
          cwd: root,
          shell: true,
          all: true,
          timeout: 60000,
          reject: false
        });

        return {
          success: result.exitCode === 0,
          result: result.all || result.stdout || result.stderr || "Command completed"
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}