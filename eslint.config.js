// eslint.config.js
const globals = require("globals");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");

const __filename = fileURLToPath(__filename);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [
    {
        ignores: ["**/.eslintrc.js", "admin/words.js"],
    },
    ...compat.extends("eslint:recommended"),
    {
        plugins: {},
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
            ecmaVersion: "latest",
            sourceType: "commonjs",
        },
        rules: {
            indent: ["error", 4, { SwitchCase: 1 }],
            "no-console": "off",
            "no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_" }],
            "no-var": "error",
            "no-trailing-spaces": "error",
            "prefer-const": "error",
            quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
            semi: ["error", "always"],
        },
    }
];

