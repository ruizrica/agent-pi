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
      // TypeScript-specific security improvements
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      
      // General code quality
      "no-console": "warn",
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      
      // Prevent accidental secrets in code
      "no-multi-str": "warn",
      "no-new-func": "error",
      "no-new-require": "error",
      "no-path-concat": "error",
      "no-process-env": "warn",
      "no-sync": "warn",
      
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
