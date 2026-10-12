const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "public");
const outputDir = path.join(__dirname, "dist");
const backendUrl = process.env.GAMECHAT_SERVER_URL;

if (!backendUrl) {
  throw new Error("Defina GAMECHAT_SERVER_URL com a URL HTTPS do backend no Render.");
}

let parsedBackendUrl;
try {
  parsedBackendUrl = new URL(backendUrl);
} catch {
  throw new Error("GAMECHAT_SERVER_URL precisa ser uma URL http(s) válida.");
}
if (!["http:", "https:"].includes(parsedBackendUrl.protocol)) {
  throw new Error("GAMECHAT_SERVER_URL precisa começar com http:// ou https://.");
}

const normalizedBackendUrl = parsedBackendUrl.origin;
fs.rmSync(outputDir, { recursive: true, force: true });
fs.cpSync(sourceDir, outputDir, { recursive: true });

const indexPath = path.join(outputDir, "index.html");
const indexHtml = fs.readFileSync(indexPath, "utf8");
fs.writeFileSync(
  indexPath,
  indexHtml.replaceAll("__GAMECHAT_SERVER_URL__", normalizedBackendUrl)
);

console.log(`Frontend compilado usando ${normalizedBackendUrl}`);
