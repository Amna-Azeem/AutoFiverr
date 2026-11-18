async function sendEmail({ to, subject, html }) {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Missing BREVO_API_KEY or EMAIL_FROM environment variable");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "AutoFiverr",
        email: process.env.EMAIL_FROM,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Brevo email failed (${response.status}): ${error}`);
  }

  return await response.json();
}

export async function sendPasswordResetEmail({
  email,
  name,
  resetUrl,
}) {
  await sendEmail({
   
    to: email,
    subject: "Reset your AutoFiverr password",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="
          margin: 0;
          padding: 0;
          background: #f8fafc;
          font-family: Arial, Helvetica, sans-serif;
          color: #0f172a;
        ">
          <div style="
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            overflow: hidden;
          ">

            <div style="
              padding: 28px;
              text-align: center;
              border-bottom: 1px solid #e2e8f0;
            ">
              <div style="
                display: inline-flex;
                width: 58px;
                height: 58px;
                border-radius: 16px;
                overflow: hidden;
              ">
                <img
                  src="https://your-domain.com/afr-logo.webp"
                  alt="AutoFiverr"
                  width="58"
                  height="58"
                  style="display:block;"
                />
              </div>

              <h1 style="
                margin: 16px 0 0;
                font-size: 24px;
              ">
                AutoFiverr
              </h1>
            </div>

            <div style="padding: 36px 32px;">

              <h2 style="
                margin: 0 0 12px;
                font-size: 24px;
              ">
                Reset your password
              </h2>

              <p style="
                margin: 0 0 20px;
                color: #64748b;
                line-height: 1.7;
              ">
                Hi ${name || "there"},
              </p>

              <p style="
                margin: 0 0 24px;
                color: #475569;
                line-height: 1.7;
              ">
                We received a request to reset the password
                for your AutoFiverr account.
              </p>

              <a
                href="${resetUrl}"
                style="
                  display: inline-block;
                  padding: 13px 22px;
                  background: #2563eb;
                  color: #ffffff;
                  text-decoration: none;
                  border-radius: 10px;
                  font-weight: 600;
                "
              >
                Reset Password
              </a>

              <p style="
                margin: 28px 0 0;
                color: #64748b;
                font-size: 14px;
                line-height: 1.7;
              ">
                This password reset link will expire in 15 minutes.
              </p>

              <p style="
                margin: 16px 0 0;
                color: #64748b;
                font-size: 14px;
                line-height: 1.7;
              ">
                If you didn't request this password reset,
                you can safely ignore this email.
              </p>

            </div>

            <div style="
              padding: 20px 32px;
              background: #f8fafc;
              color: #94a3b8;
              font-size: 12px;
              text-align: center;
            ">
              AutoFiverr · Autonomous AI Service Platform
            </div>

          </div>
        </body>
      </html>
    `,
  });
}
export async function sendVerificationEmail({
  email,
  name,
  verifyUrl,
}) {
 await sendEmail({
    to: email,
    subject: "Verify your AutoFiverr email",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="
          margin: 0;
          padding: 0;
          background: #f8fafc;
          font-family: Arial, Helvetica, sans-serif;
          color: #0f172a;
        ">
          <div style="
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            overflow: hidden;
          ">

            <div style="
              padding: 28px;
              text-align: center;
              border-bottom: 1px solid #e2e8f0;
            ">
              <h1 style="
                margin: 0;
                font-size: 24px;
              ">
                AutoFiverr
              </h1>
            </div>

            <div style="padding: 36px 32px;">

              <h2 style="
                margin: 0 0 12px;
                font-size: 24px;
              ">
                Verify your email
              </h2>

              <p style="
                margin: 0 0 20px;
                color: #64748b;
                line-height: 1.7;
              ">
                Hi ${name || "there"},
              </p>

              <p style="
                margin: 0 0 24px;
                color: #475569;
                line-height: 1.7;
              ">
                Thanks for signing up for AutoFiverr. Please
                confirm your email address to activate your account.
              </p>

              <a
                href="${verifyUrl}"
                style="
                  display: inline-block;
                  padding: 13px 22px;
                  background: #2563eb;
                  color: #ffffff;
                  text-decoration: none;
                  border-radius: 10px;
                  font-weight: 600;
                "
              >
                Verify Email
              </a>

              <p style="
                margin: 28px 0 0;
                color: #64748b;
                font-size: 14px;
                line-height: 1.7;
              ">
                This verification link will expire in 24 hours.
              </p>

              <p style="
                margin: 16px 0 0;
                color: #64748b;
                font-size: 14px;
                line-height: 1.7;
              ">
                If you didn't create an AutoFiverr account,
                you can safely ignore this email.
              </p>

            </div>

            <div style="
              padding: 20px 32px;
              background: #f8fafc;
              color: #94a3b8;
              font-size: 12px;
              text-align: center;
            ">
              AutoFiverr · Autonomous AI Service Platform
            </div>

          </div>
        </body>
      </html>
    `,
  });
}