import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/agencies", label: "AI Agencies" },
  { to: "/live-demo", label: "Live Demo" },
  { to: "/projects", label: "Projects" },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 text-slate-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-sm">
            A
          </div>
          <span className="font-display text-lg tracking-tight text-slate-900">AutoFiverr</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {links.map((link) => {
            const active = location.pathname.startsWith(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={
                  active
                    ? "text-blue-600 font-medium"
                    : "text-slate-600 hover:text-slate-900 transition-colors"
                }
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            to="/live-demo"
            className="rounded-full bg-blue-600 text-white px-4 py-1.5 font-medium shadow-sm hover:bg-blue-700 transition-colors"
          >
            Live Demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
