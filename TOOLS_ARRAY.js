/**
 * TOOLS_ARRAY.js - Patch Mode Phase 01
 * 
 * Goal: Define all 15 tools (14 original + apply_patches)
 * This is the tool schema that OpenAI sees
 */

const TOOLS = [
  // === ORIGINAL 14 TOOLS ===
  {
    name: "search_paper",
    description: "Search in paper text for specific content",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", description: "Max results", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "search_chat",
    description: "Search in chat history",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", description: "Max results", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "get_context_lines",
    description: "Get context lines around a specific line",
    parameters: {
      type: "object",
      properties: {
        lineNumber: { type: "integer", description: "Line number" },
        range: { type: "integer", description: "Lines before/after", default: 3 }
      },
      required: ["lineNumber"]
    }
  },
  {
    name: "write_replace_line",
    description: "Replace content of a specific line",
    parameters: {
      type: "object",
      properties: {
        lineNumber: { type: "integer", description: "Line number to replace" },
        text: { type: "string", description: "New content" }
      },
      required: ["lineNumber", "text"]
    }
  },
  {
    name: "insert_line",
    description: "Insert a new line at specific position",
    parameters: {
      type: "object",
      properties: {
        lineNumber: { type: "integer", description: "Insert after this line" },
        text: { type: "string", description: "Content to insert" }
      },
      required: ["lineNumber", "text"]
    }
  },
  {
    name: "delete_line",
    description: "Delete a line",
    parameters: {
      type: "object",
      properties: {
        lineNumber: { type: "integer", description: "Line number to delete" }
      },
      required: ["lineNumber"]
    }
  },
  {
    name: "verify",
    description: "Verify changes made to paper",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "revert",
    description: "Revert to a previous version",
    parameters: {
      type: "object",
      properties: {
        version: { type: "integer", description: "Version number to revert to" }
      },
      required: ["version"]
    }
  },
  {
    name: "commit_paper",
    description: "Commit changes with message",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" }
      },
      required: ["message"]
    }
  },
  {
    name: "broadcast_event",
    description: "Broadcast custom event",
    parameters: {
      type: "object",
      properties: {
        event: { type: "string", description: "Event name" },
        payload: { type: "object", description: "Event data" }
      },
      required: ["event"]
    }
  },
  {
    name: "list_comments",
    description: "List comments at specific line",
    parameters: {
      type: "object",
      properties: {
        lineNumber: { type: "integer", description: "Line number" }
      },
      required: ["lineNumber"]
    }
  },
  {
    name: "highlight_section",
    description: "Highlight a section of code",
    parameters: {
      type: "object",
      properties: {
        startLine: { type: "integer", description: "Start line" },
        endLine: { type: "integer", description: "End line" }
      },
      required: ["startLine", "endLine"]
    }
  },
  {
    name: "get_edit_history",
    description: "Get edit history",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max history entries", default: 10 }
      }
    }
  },
  {
    name: "validate_syntax",
    description: "Validate code syntax",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Code to validate" }
      },
      required: ["code"]
    }
  },

  // === NEW TOOL (PHASE 01) ===
  {
    name: "apply_patches",
    description: "Apply batch patches to paper - for efficient bulk editing",
    parameters: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          description: "Array of patches to apply",
          items: {
            type: "object",
            description: "Individual patch",
            properties: {
              type: {
                type: "string",
                enum: ["write_replace_line", "insert_line", "delete_line"],
                description: "Type of patch"
              },
              lineNumber: {
                type: "integer",
                description: "Target line number (1-indexed)"
              },
              text: {
                type: "string",
                description: "Content (required for write_replace_line and insert_line)"
              }
            },
            required: ["type", "lineNumber"]
          },
          minItems: 1,
          maxItems: 50,
          description: "Minimum 1, maximum 50 patches per call"
        }
      },
      required: ["patches"]
    }
  }
];

module.exports = TOOLS;
