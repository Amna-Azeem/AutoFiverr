import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  FileText,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = JSON.parse(
    localStorage.getItem("autofiverrUser") || "{}"
  );

  const menuRef = useRef(null);

  // Get user's initials
  const initials =
    user.name
      ?.trim()
      ?.split(/\s+/)
      ?.map((word) => word.charAt(0))
      ?.join("")
      ?.slice(0, 2)
      ?.toUpperCase() || "U";

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  function handleLogout() {
    localStorage.removeItem("autofiverrUser");
    localStorage.removeItem("autofiverrToken");

    navigate("/");
  }

  return (
    <div className="min-h-screen bg-[#f8fbff]">

      {/* TOP BAR */}
      <div className="flex items-center justify-between bg-white px-8 py-0">

        {/* Welcome */}
        <div>
          <h2 className="mb-5 text-xl font-bold text-slate-900">
            Welcome, {user.name || "User"} 👋
          </h2>
        </div>
        
        
      
        {/* PROFILE */}

        <div className="relative" ref={menuRef}>

          {/* Avatar Button */}
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Open profile menu"
            className="group flex items-center gap-3 rounded-full transition"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold shadow-sm transition-all duration-200 ${
                menuOpen
                  ? "border-blue-600 bg-blue-600 text-white shadow-md"
                  : "border-blue-100 bg-blue-200 text-blue-700 group-hover:border-blue-600 group-hover:bg-blue-100"
              }`}
            >
              {initials}
            </div>
          </button>

          {/* PROFILE DROPDOWN */}
          {menuOpen && (
            <div className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

              {/* User Information */}
              <div className="border-b border-slate-100 px-4 py-4">
                <div className="flex items-center gap-3">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {user.name || "User"}
                    </p>

                    <p className="truncate text-xs text-slate-500">
                      {user.email || "No email available"}
                    </p>
                  </div>

                </div>
              </div>

              {/* Logout */}
              <div className="p-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Logout
                </button>
              </div>

            </div>
          )}
        </div>
      </div>


      {/* HERO */}
      <section>
        <div className="w-full px-8 py-7">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">

            {/* LEFT */}
            <div>
              <div className="mb-5 inline-flex rounded-full bg-blue-100 px-5 py-2 text-xs font-bold uppercase tracking-wide text-blue-700">
                 AI-Agencies For Business Services
              </div>

              <h2 className="mb-3 text-4xl font-bold text-slate-900">
                Stop hiring freelancers.
                <br />
                Hire autonomous AI agency teams.
              </h2>

              <p className="mb-8 max-w-xl text-md leading-8 text-slate-700">
                Each AutoFiverr agency is five or six specialized agents that
                research live on Google, read your background documents, and
                cross-check each other's work — not a single chatbot answering
                in one pass.
              </p>

              <div className="flex flex-wrap items-center gap-5">
                <Link
                  to="/agencies"
                  className="rounded-full bg-blue-600 px-7 py-3 font-medium text-white transition hover:bg-blue-700"
                >
                  Explore AI Agencies
                </Link>

                <Link
                  to="/projects"
                  className="font-medium text-blue-700 hover:text-blue-800"
                >
                  View system activity →
                </Link>
              </div>
            </div>

            {/* RIGHT IMAGE */}
            <div className="relative flex justify-center">
              <div className="absolute h-[320px] w-[320px] rounded-full bg-blue-100 blur-3xl opacity-60" />

              <img
                src="/publicimageshero-workflow.png"
                alt="AutoFiverr Workflow"
                className="relative z-10 w-full max-w-[420px] object-contain"
              />
            </div>

          </div>
        </div>
      </section>


      {/* WHY CHOOSE */}
      <section className="border-b border-slate-200 bg-[#f6faff]">
        <div className="px-4 py-12">

          <div className="mb-10 mt-8">
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-blue-700">
              Why Choose AutoFiverr
            </div>

            <h2 className="mb-4 text-3xl font-bold text-slate-900">
              Built for real work, not just chat.
            </h2>

            <p className="mb-8 max-w-xl text-md leading-8 text-slate-700">
              AutoFiverr combines specialized AI agents, live research,
              document intelligence and verification workflows to support
              business tasks with structured outputs.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">

            <FeatureCard
              icon={<Users className="h-6 w-6 text-blue-600" />}
              title="Specialized AI Agents"
              text="Dedicated agents perform specific tasks and collaborate together as a team."
            />

            <FeatureCard
              icon={<Search className="h-6 w-6 text-green-600" />}
              title="Live Research"
              text="Research workflows gather information and organize findings."
            />

            <FeatureCard
              icon={<FileText className="h-6 w-6 text-purple-600" />}
              title="Document Intelligence"
              text="Upload files and let agents analyze them before work begins."
            />

            <FeatureCard
              icon={<ShieldCheck className="h-6 w-6 text-orange-500" />}
              title="Cross-Check Accuracy"
              text="Multiple agents verify outputs throughout the workflow."
            />

            <FeatureCard
              icon={<Zap className="h-6 w-6 text-violet-600" />}
              title="Workflow Outputs"
              text="Structured deliverables designed for real business processes."
            />

          </div>
        </div>
      </section>


      {/* FOOTER */}
      <footer className="bg-white">
        <div className="px-8 py-10 text-center">

          <h3 className="text-xl font-bold text-slate-900">
            AutoFiverr
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Autonomous AI agencies for real business work.
          </p>

          <div className="mt-5 text-sm text-slate-400">
            © 2026 AutoFiverr. All rights reserved.
          </div>

        </div>
      </footer>

    </div>
  );
}


function FeatureCard({ icon, title, text }) {
  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">

      <div className="mb-2 flex justify-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
          {icon}
        </div>
      </div>

      <h3 className="mb-2 text-center text-sm font-semibold text-slate-900">
        {title}
      </h3>

      <p className="text-center text-xs text-slate-500">
        {text}
      </p>

    </div>
  );
}