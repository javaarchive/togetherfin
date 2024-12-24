import {config} from "dotenv";
config();

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";

const frontendPath = path.join(process.cwd(), "..", "togetherfin-app", "build", "client");
const indexHtmlPath = path.join(frontendPath, "index.html");

const FRONTEND_ROOT = process.env.FRONTEND_ROOT || "../togetherfin-app/build/client";
console.log(FRONTEND_ROOT);

const app = new Hono();
app.use("/*", serveStatic({root:FRONTEND_ROOT}));   
// spa 404 logic
app.use("/*", serveStatic({root:FRONTEND_ROOT, rewriteRequestPath(path) {
    return "index.html";
},}));

export default app;