import { CONTRACT_VERSION, LIMITS } from "../dist/index.js";

console.log(
  JSON.stringify(
    { contract_version: CONTRACT_VERSION, status: "preview", limits: LIMITS },
    null,
    2,
  ),
);
