import js from "@eslint/js"
import globals from "globals"
import hooks from "eslint-plugin-react-hooks"

export default [
  { ignores: ["docs/**", "node_modules/**", "js/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}", "tests/**/*.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": hooks },
    rules: {
      ...hooks.configs.recommended.rules,
      "no-unused-vars": ["error", {
        varsIgnorePattern: "^[A-Z]",
        argsIgnorePattern: "^(_|[A-Z])",
      }],
    },
  },
]
