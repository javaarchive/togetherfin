import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";

const frontendPath = path.join(process.cwd(), "..", "togetherfin-app", "build", "client");
const indexHtmlPath = path.join(frontendPath, "index.html");

console.log(frontendPath);

const app = new Hono();
app.use("/*", serveStatic({root:"../togetherfin-app/build/client"}));   
// spa 404 logic
app.use("/*", serveStatic({root:"../togetherfin-app/build/client", rewriteRequestPath(path) {
    return "index.html";
},}));

export default app;