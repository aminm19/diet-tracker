import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/build/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Client: browser globals + React-specific rules.
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Server + shared: Node globals.
    files: ["server/**/*.ts", "shared/**/*.ts", "*.ts", "*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
