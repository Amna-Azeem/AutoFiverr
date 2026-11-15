console.log("🔥🔥🔥 BRAVE FILE VERSION 999 🔥🔥🔥");
console.log("BRAVE FILE:", import.meta.url);

console.log("=== BRAVE FILE LOADED ===");
console.log("=== BRAVE FILE LOADED ===");
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

console.log(
  "BRAVE KEY:",
  BRAVE_API_KEY?.slice(0, 8)
);
console.log(
  "FULL BRAVE KEY:",
  process.env.BRAVE_API_KEY
);

export async function braveSearch(query, count = 10) {
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_API_KEY,
    },
  });

 if (!response.ok) {
  const text = await response.text();

   console.log("=================================");
  console.log("BRAVE API ERROR");
  console.log("STATUS:", response.status);
  console.log("BODY:", text);
  console.log("=================================");

  throw new Error(
    `Brave API Error ${response.status}: ${text}`
  );

  console.error(
    "BRAVE RESPONSE:",
    response.status,
    text
  );

  throw new Error(
    `Brave API Error ${response.status}: ${text}`
  );
}
  return response.json();
}