/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-23 16:40:00
 */

import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "src/__tests__/tsconfig.json",
      },
    ],
  },
  testPathIgnorePatterns: ["/node_modules/", "/shared/", "/utils/"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default config;
