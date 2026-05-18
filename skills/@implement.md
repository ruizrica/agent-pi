---
description: Process @implement comments in code files and convert them to documentation
argument-hint: [file or directory to process]
allowed-tools: Task
context: fork
agent: general-purpose
---

## @implement Directives

When you find `@implement` comments in a file:

1. **Use the instructions in the comments to implement the requested changes**
2. **Convert the `@implement` comment blocks into documentation blocks:**
   - Drop the `@implement` tag
   - Rephrase the instructions as documentation if necessary

3. **Add appropriate documentation based on context:**
   - **For function signatures:** Add JSDoc/TSDoc or equivalent documentation for the language
   - **For classes:** Add JSDoc/TSDoc or equivalent class documentation for the language

The goal is to transform implementation instructions into permanent, proper documentation while executing the requested changes.
