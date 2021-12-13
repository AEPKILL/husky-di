const path = require('path');
const fs = require('fs');

const DistFilePath = path.resolve(__dirname, '../dist/index.d.ts');

const fileContent = fs.readFileSync(DistFilePath, { encoding: 'utf8' });

const newFileContent =
  [
    `/// <reference path="typings/global.d.ts" />`,
    `/// <reference path="typings/husky-di.d.ts" />`,
  ].join('\n') +
  '\n' +
  fileContent;

fs.writeFileSync(DistFilePath, newFileContent, { encoding: 'utf8' });
