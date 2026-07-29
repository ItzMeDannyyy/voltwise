// Jest config for the ESM + TypeScript backend.
// ts-jest transpiles .ts on the fly; useESM keeps the module system native ESM
// (the project is "type":"module"). The moduleNameMapper strips the explicit
// .js extension the source uses for the generated Prisma client so Jest can
// resolve it. Run with: NODE_OPTIONS=--experimental-vm-modules jest.
/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  roots: ["<rootDir>/test", "<rootDir>/src"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
};
