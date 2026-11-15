import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useNavigate,
} from "react-router-dom";

import ProjectForm from "../components/ProjectForm.jsx";

import { api } from "../api/client.js";

export default function AgencyWorkspace() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [error, setError] =
    useState(null);

  const [
    agencyName,
    setAgencyName,
  ] = useState("AI Agency");

  useEffect(() => {
    let active = true;

    async function loadAgency() {
      try {
        const { agency } =
          await api.getAgency(slug);

        if (!active) {
          return;
        }

        setAgencyName(
          agency?.name || "AI Agency"
        );
      } catch {
        if (!active) {
          return;
        }

        setAgencyName("AI Agency");
      }
    }

    if (slug) {
      loadAgency();
    }

    return () => {
      active = false;
    };
  }, [slug]);

  async function handleSubmit(formData) {
    setSubmitting(true);
    setError(null);

    formData.append("agencySlug", slug);

    try {
      const { project } =
        await api.createProject(formData);

      // Automatically open the newly created project
      navigate(`/projects/${project._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-3">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 font-display text-2xl text-slate-900">
          {agencyName}
        </h1>

        <p className="mb-8 text-sm text-slate-600">
          Submit a project brief and watch the{" "}
          {agencyName.toLowerCase()} workflow
          coordinate research, analysis, and output.
        </p>

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <ProjectForm
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>
    </div>
  );
}