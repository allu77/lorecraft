## Code style rules

- [TS-01] File naming: kebab-case (e.g. vault-reader.ts, prompt-builder.ts)
- [TS-02] Always include JSDoc for exported functions. Include intent, params, return values. Skip trivial internal helpers.
- [TS-03] Avoid heavy nesting: strive to limit to 3 levels max
- [TS-04] Avoid long functions: if a function/method is longer than 10 statements (comments excluded), consider refactoring. Functions longer than 15 statements MUST be refactored.
- [TS-05] Reduce function parameters: One or two arguments is the ideal case. Three is acceptable is there's a srtrong justification. Usually, if we have more than two arguments then our function is trying to do too much. In cases where it's not, we are probably working with standalone functions passing state along calls and we should rather turn them into methods of a class.
- [TS-06] Call things by their name: Good variable and function names are easy to understand. Avoid acronyms and single-letter names. Applies to ALL variable, type, class, interface and function name.