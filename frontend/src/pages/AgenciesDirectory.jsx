import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import AgencyCard from "../components/AgencyCard.jsx";

export default function AgenciesDirectory() {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listAgencies()
      .then((data) => setAgencies(data.agencies))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-">
      <h1 className="mb-2 text-3xl font-semibold text-slate-900">AI Agencies</h1>
      <p className="mb-10 max-w-2xl text-slate-600">
       Our AI Agencies are built to handle specific business tasks through smart, automated workflows. Each agency is designed to make complex work simpler, faster, and more organized.

      </p>

      {loading && <p className="text-sm text-slate-400">Loading agencies...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-1 gap-6">
        {agencies.map((agency) => (
          <AgencyCard key={agency.slug} agency={agency} />
        ))}
      </div>
    </div>
  );
}
