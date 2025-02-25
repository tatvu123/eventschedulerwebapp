import eslint from 'eslint';

export default [
  {
    ignores: ["dist/**", "node_modules/**" ,"docs/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-console": "warn",
      "semi": ["error", "always"],
      "quotes": ["error", "single"]
    }
  }
];