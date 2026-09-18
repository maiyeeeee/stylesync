import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"

export default [
    { ignores: ["dist"] },
    {
        files: ["**/*.{js,jsx}"],
        languageOptions: {
            ecmaVersion: "latest",
            globals: globals.browser,
            parserOptions: {
                ecmaFeatures: { jsx: true },
                sourceType: "module",
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...js.configs.recommended.rules,
            // The React Compiler rules bundled with the plugin's recommended preset
            // flag the fetch-effect pattern used across every data-loading screen,
            // so only the classic hook correctness rules are enabled.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
        },
    },
    {
        // Generated shadcn/ui primitives re-export several components per file.
        files: ["src/components/ui/**"],
        rules: { "react-refresh/only-export-components": "off" },
    },
]
