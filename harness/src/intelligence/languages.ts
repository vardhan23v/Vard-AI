/**
 * Languages, their tree-sitter grammars (WASM, embedded in the binary) and the queries that find
 * definitions, imports and references. Grammars load lazily on first use.
 */
import { Language, Parser, Query } from "@vscode/tree-sitter-wasm";
import coreWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter.wasm" with { type: "file" };
import cppWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm" with { type: "file" };
import goWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm" with { type: "file" };
import javaWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm" with { type: "file" };
import jsWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm" with { type: "file" };
import pyWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm" with { type: "file" };
import rustWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm" with { type: "file" };
import tsxWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm" with { type: "file" };
import tsWasm from "@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm" with { type: "file" };
import type { Lang } from "./schema";

const EXT: Record<string, Lang> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".json": "json",
  ".md": "markdown",
  ".mdx": "markdown",
};

export function langOf(p: string): Lang | undefined {
  const m = /\.[A-Za-z0-9]+$/.exec(p);
  if (!m) return undefined;
  if (p.endsWith(".d.ts")) return "typescript";
  return EXT[m[0].toLowerCase()];
}

/** Languages parsed with tree-sitter (C files use the C++ grammar, which parses C). */
const GRAMMAR: Partial<Record<Lang, string>> = {
  typescript: tsWasm,
  tsx: tsxWasm,
  javascript: jsWasm,
  python: pyWasm,
  rust: rustWasm,
  go: goWasm,
  java: javaWasm,
  cpp: cppWasm,
  c: cppWasm,
};

const TS_DEFS = `
(class_declaration name: (type_identifier) @name) @def.class
(abstract_class_declaration name: (type_identifier) @name) @def.class
(interface_declaration name: (type_identifier) @name) @def.interface
(type_alias_declaration name: (type_identifier) @name) @def.type
(enum_declaration name: (identifier) @name) @def.enum
(function_declaration name: (identifier) @name) @def.function
(generator_function_declaration name: (identifier) @name) @def.function
(method_definition name: (property_identifier) @name) @def.method
(variable_declarator name: (identifier) @name) @def.variable
(internal_module name: (_) @name) @def.module
(import_statement source: (string) @import)
(export_statement source: (string) @import)
(call_expression function: (identifier) @ref.call)
(call_expression function: (member_expression property: (property_identifier) @ref.call))
(new_expression constructor: (identifier) @ref.call)
(type_identifier) @ref.type
`;
const JSX_REFS = `
(jsx_opening_element name: (identifier) @ref.call)
(jsx_self_closing_element name: (identifier) @ref.call)
`;
const JS_DEFS = `
(class_declaration name: (identifier) @name) @def.class
(function_declaration name: (identifier) @name) @def.function
(generator_function_declaration name: (identifier) @name) @def.function
(method_definition name: (property_identifier) @name) @def.method
(variable_declarator name: (identifier) @name) @def.variable
(import_statement source: (string) @import)
(export_statement source: (string) @import)
(call_expression function: (identifier) @ref.call)
(call_expression function: (member_expression property: (property_identifier) @ref.call))
(new_expression constructor: (identifier) @ref.call)
`;

export const QUERIES: Partial<Record<Lang, string>> = {
  typescript: TS_DEFS,
  tsx: TS_DEFS + JSX_REFS,
  javascript: JS_DEFS + JSX_REFS,
  python: `
(class_definition name: (identifier) @name) @def.class
(function_definition name: (identifier) @name) @def.function
(module (expression_statement (assignment left: (identifier) @name)) @def.variable)
(import_statement name: (dotted_name) @import)
(import_statement name: (aliased_import name: (dotted_name) @import))
(import_from_statement module_name: (_) @import)
(call function: (identifier) @ref.call)
(call function: (attribute attribute: (identifier) @ref.call))
`,
  rust: `
(struct_item name: (type_identifier) @name) @def.struct
(enum_item name: (type_identifier) @name) @def.enum
(trait_item name: (type_identifier) @name) @def.trait
(type_item name: (type_identifier) @name) @def.type
(function_item name: (identifier) @name) @def.function
(function_signature_item name: (identifier) @name) @def.function
(mod_item name: (identifier) @name) @def.module
(const_item name: (identifier) @name) @def.variable
(static_item name: (identifier) @name) @def.variable
(macro_definition name: (identifier) @name) @def.function
(use_declaration argument: (_) @import)
(call_expression function: (identifier) @ref.call)
(call_expression function: (scoped_identifier name: (identifier) @ref.call))
(call_expression function: (field_expression field: (field_identifier) @ref.call))
(type_identifier) @ref.type
`,
  go: `
(function_declaration name: (identifier) @name) @def.function
(method_declaration name: (field_identifier) @name) @def.method
(type_spec name: (type_identifier) @name) @def.type
(import_spec path: (interpreted_string_literal) @import)
(call_expression function: (identifier) @ref.call)
(call_expression function: (selector_expression field: (field_identifier) @ref.call))
(type_identifier) @ref.type
`,
  java: `
(class_declaration name: (identifier) @name) @def.class
(interface_declaration name: (identifier) @name) @def.interface
(enum_declaration name: (identifier) @name) @def.enum
(record_declaration name: (identifier) @name) @def.class
(method_declaration name: (identifier) @name) @def.method
(constructor_declaration name: (identifier) @name) @def.method
(import_declaration (scoped_identifier) @import)
(method_invocation name: (identifier) @ref.call)
(object_creation_expression type: (type_identifier) @ref.call)
(type_identifier) @ref.type
`,
  cpp: `
(function_definition declarator: (function_declarator declarator: (identifier) @name)) @def.function
(function_definition declarator: (function_declarator declarator: (field_identifier) @name)) @def.method
(function_definition declarator: (function_declarator declarator: (qualified_identifier name: (identifier) @name))) @def.method
(function_definition declarator: (function_declarator declarator: (qualified_identifier name: (qualified_identifier name: (identifier) @name)))) @def.method
(struct_specifier name: (type_identifier) @name body: (_)) @def.struct
(class_specifier name: (type_identifier) @name body: (_)) @def.class
(enum_specifier name: (type_identifier) @name body: (_)) @def.enum
(namespace_definition name: (namespace_identifier) @name) @def.module
(preproc_include path: (_) @import)
(call_expression function: (identifier) @ref.call)
(call_expression function: (field_expression field: (field_identifier) @ref.call))
(call_expression function: (qualified_identifier name: (identifier) @ref.call))
(type_identifier) @ref.type
`,
};
QUERIES.c = QUERIES.cpp;

let initPromise: Promise<void> | null = null;
const langCache = new Map<string, Promise<Language>>();
const queryCache = new Map<string, Query[]>();

export function hasGrammar(l: Lang) {
  return !!GRAMMAR[l];
}

async function language(l: Lang): Promise<Language> {
  initPromise ??= Parser.init({ locateFile: () => coreWasm });
  await initPromise;
  const file = GRAMMAR[l]!;
  let p = langCache.get(file);
  if (!p) {
    p = Bun.file(file)
      .arrayBuffer()
      .then((b) => Language.load(new Uint8Array(b)));
    langCache.set(file, p);
  }
  return p;
}

/**
 * Compiles each query pattern on its own, so a pattern a grammar version doesn't support is
 * skipped instead of disabling the language. Returns the compiled queries.
 */
function compile(l: Lang, lang: Language): Query[] {
  const key = GRAMMAR[l] + (l === "c" ? "cpp" : l);
  const hit = queryCache.get(key);
  if (hit) return hit;
  const out: Query[] = [];
  for (const pattern of (QUERIES[l] ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    try {
      out.push(new Query(lang, pattern));
    } catch {
      // Not supported by this grammar version.
    }
  }
  queryCache.set(key, out);
  return out;
}

export async function parserFor(l: Lang): Promise<{ parser: Parser; queries: Query[] } | null> {
  if (!GRAMMAR[l]) return null;
  const lang = await language(l);
  const parser = new Parser();
  parser.setLanguage(lang);
  return { parser, queries: compile(l, lang) };
}
