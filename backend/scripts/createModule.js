import path from "path";
import fs from "fs";

const moduleName = process.argv[2];

if (!moduleName) {
  console.log("Please provide a module name.");
  process.exit(1);
}

const modulePath = path.join("src", "modules", moduleName);

fs.mkdirSync(modulePath, { recursive: true });

const files = [
  `${moduleName}.routes.ts`,
  `${moduleName}.controller.ts`,
  `${moduleName}.service.ts`,
  `${moduleName}.dto.ts`,
];

files.forEach((file) => {
  const filePath = path.join(modulePath, file);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
});

console.log(`Module '${moduleName}' created successfully.`);
