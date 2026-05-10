import { getAgentRuntimeConfig } from "./app/config.js";
import { createApp } from "./app/orchestrator.js";

const app = createApp(getAgentRuntimeConfig());
app.start();
