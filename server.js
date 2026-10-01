import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  const pathname = new URL(request.url, "http://localhost").pathname;
  const routeFiles = {
    "/checkout": "/checkout.html",
    "/checkout/": "/checkout.html",
    "/auth/callback": "/auth-callback.html",
    "/auth/callback/": "/auth-callback.html"
  };
  const servedPath = routeFiles[pathname] || pathname;
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(servedPath);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const file = resolve(root, `.${requestedPath === "/" ? "/index.html" : requestedPath}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Atelier June demo is ready at http://127.0.0.1:${port}`);
});
