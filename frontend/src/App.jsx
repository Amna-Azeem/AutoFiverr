import { NavLink, Routes, Route, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiHome,
  FiGrid,
  FiPlayCircle,
  FiFolder,
  FiBarChart2,
} from "react-icons/fi";
import afrLogo from "./assets/afr-logo.webp";
import Login from "./pages/login.jsx";
import { useLocation } from "react-router-dom";
import Signup from "./pages/signup.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AgenciesDirectory from "./pages/AgenciesDirectory.jsx";
import AgencyWorkspace from "./pages/AgencyWorkspace.jsx";
import DeliverablesDashboard from "./pages/DeliverablesDashboard.jsx";
import AdminLogsDashboard from "./pages/AdminLogsDashboard.jsx";
import LiveDemo from "./pages/LiveDemo.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import CompletedProjectView from "./pages/CompletedProjectView.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
const sidebarLinks = [
  { label: "Home", to: "/landing", icon: FiHome },
  { label: "AI Agencies", to: "/agencies", icon: FiGrid },
  { label: "Live Demo", to: "/live-demo", icon: FiPlayCircle },
  { label: "Projects", to: "/projects", icon: FiFolder },
  { label: "Analytics", to: "/analytics", icon: FiBarChart2 },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

const hideSidebar =
  location.pathname === "/" ||
  location.pathname === "/signup" ||
  location.pathname.startsWith("/verify-email/");

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen">
        {!hideSidebar && (
        
        <aside className="fixed left-0 top-0 flex h-screen w-56 flex-col border-r border-slate-200 bg-slate-50">
          {/* Header */}
          <div className=" mt-9 flex items-center gap-3 border-b border-slate-200 px-0 py-0 ">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="flex h-9 w-4 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200"
            >
              <FiArrowLeft size={20} />
            </button>

            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-blue-600">
  <img
    src={afrLogo}
    alt="AFR Logo"
    className="h-full w-full scale-150 object-contain"
  />
</div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Platform
              </p>
              <p className="text-2xl font-semibold text-slate-900">
                AutoFiverr
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-6 space-y-2 px-4">
            {sidebarLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  }`
                }
              >
                <>
  <link.icon size={18} />
  <span>{link.label}</span>
</>
              </NavLink>
            ))}
          </nav>
         <div className="mt-auto px-5 pb-2 ">
  <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
   
    

    <div className="flex items-center gap-2">
   <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
    ✨
    </div>

   <h3 className="text-sm font-semibold text-slate-900">
    See It In Action
   </h3>
    </div>

    <p className="mt-1 text-xs text-slate-500">
      Watch how our AI agency teams work together.
    </p>

    <button
      onClick={() => navigate("/live-demo")}
      className="mt-3 rounded-full border border-blue-500 px-3 py-1.5 text-xs  bg-white font-medium text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
    >
      Watch Demo →
    </button>
  </div>
</div>
        </aside>
        )}
        

       
        <div
  className={`flex-1 min-w-0 ${
    hideSidebar ? "" : "ml-64"
  }`}
>
          <main className="min-h-screen pt-10 overflow-x-hidden">
            <Routes>
              <Route path="/signup" element={<Signup />} />
              <Route path="/" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
<Route
  path="/reset-password/:token"
  element={<ResetPassword />}
/>

<Route
  path="/verify-email/:token"
  element={<VerifyEmail />}
/>
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/agencies" element={<AgenciesDirectory />} />
              <Route
                path="/agencies/:slug/new"
                element={<AgencyWorkspace />}
              />
              <Route path="/live-demo" element={<LiveDemo />} />
              <Route path="/projects" element={<AdminLogsDashboard />} />
                           <Route
                path="/projects/:id"
                element={
                  <CompletedProjectView>
                    {({ project }) => (
                      <DeliverablesDashboard project={project} />
                    )}
                  </CompletedProjectView>
                }
              />
              <Route path="/admin" element={<AdminLogsDashboard />} />
              <Route
  path="/analytics"
  element={<AnalyticsPage />}
/>
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}