
import { useId, useState } from "react";
import { CRMS, downloadCrmCsv } from "./crmExports.js";

export default function CrmExportMenu({
  leads = [],
  projectName = "leads",
  className = "",
  children,
}) {
  const [crmId, setCrmId] = useState("generic");
  const [open, setOpen] = useState(false);
  const selectId = useId();

  const disabled = !leads.length;
  const crm = CRMS[crmId];

  const handleExport = () => {
    downloadCrmCsv(leads, crmId, projectName);
    setOpen(true);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex flex-col items-end gap-3">
  {/* Row 1: CRM selector */}
  <div className="flex items-center gap-2">
    <label
      htmlFor={selectId}
      className="text-sm font-medium text-slate-600 whitespace-nowrap"
    >
      Export to
    </label>

    <select
      id={selectId}
      value={crmId}
      onChange={(e) => {
        setCrmId(e.target.value);
        setOpen(false);
      }}
      className="
        h-11 min-w-[150px] rounded-lg
        border border-slate-200 bg-white
        px-4 text-sm font-medium text-slate-700
        outline-none transition
        hover:border-slate-400
        focus:border-blue-500 focus:ring-2 focus:ring-blue-100
      "
    >
      {Object.entries(CRMS).map(([id, c]) => (
        <option key={id} value={id}>
          {c.label}
        </option>
      ))}
    </select>
  </div>

  {/* Row 2: Word button (children) + CRM export button */}
  <div className="flex flex-wrap items-center justify-end gap-2">
    {children}

    <button
      type="button"
      disabled={disabled}
      onClick={handleExport}
      className="
        inline-flex h-11 shrink-0 items-center justify-center
        whitespace-nowrap rounded-lg border border-orange-300
        bg-white px-5 text-sm font-semibold text-orange-700
        transition hover:border-orange-500 hover:bg-orange-50
        disabled:cursor-not-allowed disabled:opacity-40
      "
    >
      <span className="mr-2">↓</span>
      {crm.buttonLabel || `Download ${crm.label} CSV`}
    </button>
  </div>
</div>

      {/* Import instructions */}
      {open && (
        <div
          role="status"
          className="
            mt-4 rounded-xl border border-slate-200
            bg-slate-50 p-5 shadow-sm
          "
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Import into {crm.label}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Follow these steps to import your exported leads.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close instructions"
              className="text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          </div>

          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            {crm.help.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Leads without a public email may be imported as companies only,
            depending on CRM support.
          </p>
        </div>
      )}
    </div>
  );
}
