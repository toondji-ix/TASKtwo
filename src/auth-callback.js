import { completeAuthCallback } from "./backend.js";

const title = document.querySelector("#callback-title");
const message = document.querySelector("#callback-message");
const returnLink = document.querySelector("#callback-return");

try {
  const next = await completeAuthCallback(window.location.href);
  window.location.replace(next);
} catch (error) {
  title.textContent = "This link could not be verified.";
  message.textContent = `${error.message} You can return to the store and request a fresh link.`;
  returnLink.hidden = false;
}
