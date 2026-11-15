
import "dotenv/config";

const token = process.env.HUBSPOT_TOKEN;

if (!token) {
  console.log("HUBSPOT_TOKEN is missing from backend/.env");
  process.exit(1);
}

try {
  const response = await fetch(
    "https://api.hubapi.com/crm/v3/objects/companies?limit=1",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log("HubSpot HTTP status:", response.status);

  if (response.ok) {
    console.log("Success! HubSpot connection is working.");
  } else {
    const data = await response.text();
    console.log("HubSpot error:", data.slice(0, 500));
  }
} catch (error) {
  console.log("Connection error:", error.message);
}