// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { globalIgnores } from "eslint/config";

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        "rules": {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/prefer-as-const": "off",
            "no-prototype-builtins": "off",
            "no-case-declarations": "off",
            "no-undef": "off"
        }
    },
    globalIgnores(["dist/"])
);
