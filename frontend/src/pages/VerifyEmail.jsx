import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";

export default function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState("Verifying your email...");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function verify() {
      try {
        await api.verifyEmail(token);

        if (active) {
          setStatus("Email verified successfully! You can now sign in.");
        }
      } catch (err) {
        if (active) {
          setError(true);
          setStatus(err.message || "Email verification failed.");
        }
      }
    }

    if (token) verify();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-3 text-2xl font-semibold text-slate-900">
          Email Verification
        </h1>

        <p className={error ? "mb-6 text-red-600" : "mb-6 text-slate-600"}>
          {status}
        </p>

        {!error && status.startsWith("Email verified") && (
          <Link
            to="/"
            className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-medium text-white"
          >
            Go to Login
          </Link>
        )}

        {error && (
          <Link to="/" className="font-medium text-blue-600">
            Return to Login
          </Link>
        )}
      </div>
    </div>
  );
}

