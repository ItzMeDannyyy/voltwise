import "dotenv/config";

export const DATABASE_URL = (): string => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }
  return process.env.DATABASE_URL;
};

export default DATABASE_URL;

