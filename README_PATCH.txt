Help menu sublinks patch

Changes:
- Replaces the single Help navigation link with an Angular Material dropdown menu.
- Adds Quick Help -> /help.
- Adds 完整中文手册 -> /docs/readme-zh.html in a new browser tab.

Apply:
1. Extract this ZIP into the project root and allow overwrite.
2. Run:
   npm run check:conflicts
   npm run test:ci
   npm run test:golden
   npm run build
3. Commit and push.
