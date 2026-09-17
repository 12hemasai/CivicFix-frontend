import { FormData } from "undici"; // Wait, fetch is native
const form = new FormData();
form.append("api_key", "test");
const blob = new Blob([new Uint8Array(2)], { type: "image/jpeg" });
form.append("image", blob, "test.jpg");
try {
  const response = await fetch("https://serpapi.com/image", { method: "POST", body: form });
  console.log("Status:", response.status);
} catch (err) {
  console.error("Fetch failed:", err);
}
