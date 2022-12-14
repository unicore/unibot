module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: ['airbnb-base'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    'no-console': 'off',
    'linebreak-style': ['error', 'unix'],
    'no-restricted-syntax': 'off',
    'no-unused-vars': 'off',
    'max-len': 'off',
    'no-use-before-define': 'off',
    'no-empty-function': 'off',
    'global-require': 'off',
    'no-async-promise-executor': 'off',
    'prefer-template': 'off',
    'no-shadow': 'off',
    'one-var': 'off',
    'array-callback-return': 'off',
    'no-plusplus': 'off',
    'prefer-promise-reject-errors': 'off',
    'no-mixed-operators': 'off',
    'import/order': 'off',
    'no-unused-expressions': 'off',
    'no-await-in-loop': 'off',
    'no-lonely-if': 'off',
    radix: 'off',
    'no-empty': 'off',
    'no-param-reassign': 'off',
    'no-else-return': 'off',
    'no-promise-executor-return': 'off',
    'prefer-destructuring': 'off',
    'no-nested-ternary': 'off',
    'consistent-return': 'off',
    'no-return-await': 'off',
    'class-methods-use-this': 'off',
    camelcase: 'off',
  },
};
