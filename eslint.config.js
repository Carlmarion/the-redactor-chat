import js from "@eslint/js";
import tseslint from "typescript-eslint";
import gandalf from "./eslint-plugin-gandalf/index.js";

export default tseslint.config(
  { ignores: ["node_modules", "data", "*.db*"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { gandalf },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "gandalf/no-direct-fetch": "warn",
      "gandalf/no-useeffect-derived-state": "warn",
      "gandalf/no-business-logic-in-jsx": "warn",
    },
  },
);
