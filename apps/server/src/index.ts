import { buildApp } from "./app.js";

const app = buildApp();

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`Server listening on http://${host}:${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
