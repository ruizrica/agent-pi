[
  {
    "files": ["**/*.ts"],
    "plugins": {},
    "rules": {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "no-console": "warn",
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-multi-str": "warn",
      "no-new-func": "error",
      "no-new-require": "error",
      "no-path-concat": "error",
      "no-process-env": "warn",
      "no-sync": "warn"
    }
  },
  {
    "ignores": ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.min.js", "**/coverage/**", "extensions/__tests__/**", "skills/expo-cicd-workflows/scripts/**", "tex/**"]
  }
]