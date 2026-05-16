// ESLint configuration with security-focused rules
// Run with: npx eslint . or npm run lint

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: {
      // Security rules - uncomment after installing eslint-plugin-security
      // security: securityPlugin,
    },
    rules: {
      // TypeScript-specific
      "@typescript-eslint/no-explicit-any": "warn",
      // NOTE: @typescript-eslint/no-unsafe-* rules require type-aware linting
      // (parserOptions.projectService + a tsconfig.json). This repo has no
      // tsconfig.json, so the rules are silently no-ops. Re-enable after
      // wiring up tseslint.configs.recommendedTypeChecked.
      //
      // "@typescript-eslint/no-unsafe-assignment": "warn",
      // "@typescript-eslint/no-unsafe-call": "warn",
      // "@typescript-eslint/no-unsafe-member-access": "warn",
      // "@typescript-eslint/no-unsafe-return": "warn",

      // General code quality (core ESLint rules)
      "no-console": "warn",
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",

      // Prevent accidental secrets in code (core ESLint rules)
      "no-multi-str": "warn",
      "no-new-func": "error",

      // NOTE: no-new-require / no-path-concat / no-process-env / no-sync are
      // not core ESLint rules — they live in `eslint-plugin-n` (Node) and
      // would need to be namespaced as `n/no-process-env` etc. with the
      // plugin installed. Removed for now so ESLint config validation
      // succeeds; install eslint-plugin-n and re-add under the `n/` prefix
      // if you want them enforced.

      // Security-focused (uncomment when eslint-plugin-security is installed)
      // "security/detect-eval-with-expression": "error",
      // "security/detect-non-literal-fs-filename": "warn",
      // "security/detect-non-literal-regex": "warn",
      // "security/detect-non-literal-require": "warn",
      // "security/detect-object-injection": "warn",
      // "security/detect-possible-timing-attacks": "warn",
      // "security/detect-pseudoRandomBytes": "warn",
      // "security/detect-unsafe-regex": "error",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/*.min.js",
      "**/coverage/**",
      "extensions/__tests__/**", // Test fixtures may contain intentional patterns
      "skills/expo-cicd-workflows/scripts/**", // Generated workflow scripts
      "tex/**", // TeX processing files
    ],
  }
);
