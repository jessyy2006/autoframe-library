import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import tsdoc from "eslint-plugin-tsdoc";
import eslint from "@eslint/js";
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // Ignore the build output directory
    { ignores: ['lib'] },
    // Ignore unwanted files
    { ignores: ['**/node_modules/**'] },

    eslint.configs.recommended,
    ...tseslint.configs.strict,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2024
            }
        },
        plugins: {
            "unused-imports": unusedImports,
            tsdoc,
        },
    },
    {
        files: ["**/src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
            globals: {
                config: true,
                moment: true
            }
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off"
        }
    },
    {
        files: ["**/*.cjs"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'commonjs',
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off"
        }
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2024,
            sourceType: "module",

            parserOptions: {
                project: ["tsconfig.json"],
            },
        },

        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.strict,
            ...tseslint.configs.stylistic,
        ],

        rules: {
            // TSDoc rules
            "tsdoc/syntax": "warn",

            // ESLint rules
            "accessor-pairs": 2,

            "sort-imports": ["error", {
                ignoreDeclarationSort: true,
            }],

            "no-multiple-empty-lines": "warn",
            "no-whitespace-before-property": "error",
            "no-multi-spaces": "warn",
            "no-extra-parens": [2, "functions"],
            "no-inner-declarations": [2, "functions"],
            "max-depth": [2, 8],
            "no-shadow": "off",
            "no-label-var": 2,
            "no-undef-init": 2,
            strict: 2,
            "consistent-return": 1,
            "default-case": 2,
            "dot-location": [2, "property"],

            "dot-notation": [0, {
                allowKeywords: true,
            }],

            curly: 0,
            eqeqeq: 2,
            "guard-for-in": 1,
            "no-alert": "off",
            "no-caller": 2,
            "no-cond-assign": 2,
            "no-div-regex": 2,
            "no-debugger": 2,
            "no-else-return": "warn",
            "no-labels": 2,
            "no-eq-null": 2,
            "no-eval": 2,

            "no-extend-native": [2, {
                exceptions: ["String"],
            }],

            "no-extra-bind": 2,
            "no-fallthrough": "off",
            "no-floating-decimal": 2,
            "no-implicit-coercion": 2,
            "no-implied-eval": 2,
            "no-iterator": 2,
            "no-lone-blocks": 2,
            "no-loop-func": "off",
            "no-multi-str": ["warn"],
            "no-new-func": 2,
            "no-new-wrappers": 2,
            "no-new": 2,
            "no-octal-escape": 2,
            "no-proto": 2,
            "no-redeclare": 2,
            "no-return-assign": 2,
            "no-script-url": 2,
            "no-self-compare": 2,
            "no-sequences": 2,
            "no-throw-literal": 2,
            "no-unused-expressions": 2,
            "no-useless-call": 2,
            radix: 2,
            "wrap-iife": 2,
            yoda: [2, "never"],
            "array-bracket-spacing": "warn",
            "block-spacing": "warn",

            "comma-spacing": [2, {
                before: false,
                after: true,
            }],

            "comma-style": [2, "last"],
            "computed-property-spacing": [2, "never"],

            "id-length": [1, {
                min: 2,
                properties: "never",
                exceptions: ["i", "j", "$", "_"],
            }],

            "new-cap": [2, {
                newIsCap: true,
                capIsNew: false,
                capIsNewExceptions: ["Event"],
            }],

            "new-parens": 2,
            "no-array-constructor": 2,
            "no-new-object": 2,
            "func-call-spacing": 2,
            "no-unneeded-ternary": 2,
            "one-var": [2, "never"],
            "operator-linebreak": [2, "after"],

            "quote-props": ["warn", "as-needed", {
                keywords: true,
                unnecessary: false,
            }],

            quotes: [0, "double", "avoid-escape"],

            "semi-spacing": [1, {
                before: false,
                after: true,
            }],

            "space-before-blocks": [1, "always"],

            "space-before-function-paren": [0, {
                anonymous: "never",
                named: "never",
                asyncArrow: "never",
            }],

            "keyword-spacing": 1,

            "space-infix-ops": [1, {
                int32Hint: true,
            }],

            "space-unary-ops": [2, {
                words: true,
                nonwords: false,
            }],

            "wrap-regex": 2,
            "no-console": "off",
            "no-unused-labels": 2,
            //"@typescript-eslint/indent": ["warn", 4],
            "indent": [
                "warn",
                4,
                {
                    "SwitchCase": 1
                }
            ],
            "semi": "warn",
            "no-var": "warn",
            "space-in-parens": "warn",
            "prefer-const": "warn",
            "arrow-spacing": ["error"],
            "no-useless-escape": "off",
            "no-prototype-builtins": "warn",
            "no-empty": "off",
            "prefer-spread": "warn",
            "no-dupe-else-if": "off",
            "no-control-regex": "off",

            // Typescript-ESLint rules
            "@typescript-eslint/naming-convention": "off",

            // Note: you must disable the base rule as it can report incorrect errors
            "no-empty-function": "off",
            "@typescript-eslint/no-empty-function": "off",

             // Note: you must disable the base rule as it can report incorrect errors
            "no-use-before-define": "off",
            "@typescript-eslint/no-use-before-define": "off",


            "@typescript-eslint/no-restricted-types": "error",
            "@typescript-eslint/restrict-template-expressions": "off",

            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-extraneous-class": "off",

            "@typescript-eslint/explicit-member-accessibility": ["off", { // TODO: to remove
                accessibility: "explicit",
            }],
            "@typescript-eslint/explicit-function-return-type": "off", // TODO: to remove
            "@typescript-eslint/no-unsafe-return": "warn", // TODO: to remove
            "@typescript-eslint/no-unsafe-member-access": "off", // TODO: to remove
            "@typescript-eslint/no-unsafe-argument": "off", // TODO: to remove
            "@typescript-eslint/no-unsafe-assignment": "off", // TODO: to remove
            "@typescript-eslint/no-unsafe-call": "off", // TODO: to remove
            "@typescript-eslint/no-require-imports": "off", // TODO: to remove
            "@typescript-eslint/no-unnecessary-condition": "off", // TODO: to remove
            "@typescript-eslint/prefer-nullish-coalescing": "off", // TODO: to remove
            "@typescript-eslint/triple-slash-reference": "off",
            "@typescript-eslint/unified-signatures": "error",
            "@typescript-eslint/prefer-namespace-keyword": "error",
            "@typescript-eslint/await-thenable": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "@typescript-eslint/prefer-includes": "off",
            "@typescript-eslint/prefer-regexp-exec": "off",
            "@typescript-eslint/prefer-string-starts-ends-with": "off",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/unbound-method": "off",
            "@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
            "@typescript-eslint/no-dynamic-delete": "off",
            "@typescript-eslint/no-throw-literal": "off",
            "@typescript-eslint/no-this-alias": "warn",
            "@typescript-eslint/dot-notation": "off",
            "@typescript-eslint/ban-types": "off",
            "@typescript-eslint/member-ordering": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-parameter-properties": "off",
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/prefer-for-of": "off",
            "@typescript-eslint/prefer-function-type": "error",
            "@typescript-eslint/quotes": ["off", "double"],
            "@typescript-eslint/interface-name-prefix": "off",
            "@typescript-eslint/class-name-casing": ["off"],
            "@typescript-eslint/no-floating-promises": ["off"],
            "@typescript-eslint/array-type": "error",
            "@typescript-eslint/restrict-plus-operands": "off",
            "@typescript-eslint/no-empty-object-type": "off",

            // Unused-imports
            "no-unused-vars": "off", // Disable ESLint rules
            "@typescript-eslint/no-unused-vars": "off", // Disable Typescript-ESLint rule
            "unused-imports/no-unused-imports": "warn",

            "unused-imports/no-unused-vars": ["warn", {
                vars: "all",
                varsIgnorePattern: "^_",
                args: "after-used",
                argsIgnorePattern: "^_",
            }],
        },
    }
)
