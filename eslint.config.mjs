import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import {defineConfig} from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "node_modules",
      "dist",
      ".yarn",
      ".pnp*"
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
  },
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  ...tseslint.configs.recommended, // or `recommended` for non-type-aware
  reactPlugin.configs.flat.recommended,
  // reactHooks.configs["recommended"],
  reactHooks.configs.flat["recommended-latest"],
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      // downgrade new rules to reduce errors
      "react/prop-types": "off",
    },
  },
]);
