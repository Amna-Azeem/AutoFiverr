import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/user.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../utils/email.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function createJwt(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
}

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}



async function issueVerification(user) {
  const rawToken = crypto.randomBytes(32).toString("hex");

  user.emailVerificationToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  user.emailVerificationExpires =
    Date.now() + 24 * 60 * 60 * 1000;

  await user.save();

  const frontendUrl =
    process.env.FRONTEND_URL || "http://localhost:5173";

  const verifyUrl =
    `${frontendUrl}/verify-email/${rawToken}`;

  console.log("[verification] Sending email to:", user.email);

  await sendVerificationEmail({
    email: user.email,
    name: user.name,
    verifyUrl,
  });

  console.log("[verification] Email sent successfully to:", user.email);
}




// --------------------------------------------------
// SIGNUP
// --------------------------------------------------

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({
      email: normalizedEmail,
    });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
if (!emailPattern.test(normalizedEmail)) {
  return res.status(400).json({ error: "Please enter a valid email address" });
}
   
if (existing) {
  if (!existing.emailVerified) {
    try {
      await issueVerification(existing);

      return res.status(200).json({
        success: true,
        message:
          "This account already exists but is not verified. A new verification link has been sent if email delivery succeeded.",
      });
    } catch (emailError) {
      console.error(
        "[auth resend during signup]",
        emailError
      );

      return res.status(200).json({
  success: true,
  message:
    "This account exists but isn't verified, and we couldn't send the email right now. Try Resend verification on the login page.",
});
    }
  }

  return res.status(400).json({
    error: "An account with this email already exists",
  });
}



    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

        await issueVerification(user);

    res.status(201).json({
      success: true,
      message: "Account created. Check your email to verify your address.",
    });

  } catch (err) {
    console.error("[auth signup]", err);

    res.status(500).json({
      error: "Unable to create account",
    });
  }
});


// --------------------------------------------------
// LOGIN
// --------------------------------------------------

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

        if (!user.emailVerified) {
      return res.status(403).json({
        error: "Please verify your email before signing in.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const token = createJwt(user);

    res.json({
      success: true,
      token,
      user: publicUser(user),
    });
  } catch (err) {
    console.error("[auth login]", err);

    res.status(500).json({
      error: "Unable to sign in",
    });
  }
});


// --------------------------------------------------
// FORGOT PASSWORD
// --------------------------------------------------

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email address is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    // Don't reveal whether an account exists.
    if (!user) {
      return res.json({
        success: true,
        message:
          "If an account exists for this email, a reset link has been sent.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.passwordResetToken = hashedToken;

    user.passwordResetExpires =
      Date.now() + 15 * 60 * 1000;

    await user.save();

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:5173";

    const resetUrl =
      `${frontendUrl}/reset-password/${rawToken}`;

    await sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      resetUrl,
    });

    res.json({
      success: true,
      message:
        "If an account exists for this email, a reset link has been sent.",
    });

  } catch (err) {
    console.error("[auth forgot-password]", err);

    res.status(500).json({
      error: "Unable to send password reset email",
    });
  }
});


// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------

router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: "New password is required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        $gt: new Date(),
      },
    });

    if (!user) {
      return res.status(400).json({
        error: "This reset link is invalid or has expired",
      });
    }

    user.password = await bcrypt.hash(password, 12);

    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
    });

  } catch (err) {
    console.error("[auth reset-password]", err);

    res.status(500).json({
      error: "Unable to reset password",
    });
  }
});


// --------------------------------------------------
// CHANGE PASSWORD
// --------------------------------------------------

router.put("/password", requireAuth, async (req, res) => {
  try {
    const {
      
      currentPassword,
      newPassword,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(400).json({
        error: "User not found",
      });
    }
    const matches = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!matches) {
      return res.status(400).json({
        error: "Current password incorrect",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);

    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });

  } catch (err) {
    console.error("[auth password]", err);

    res.status(500).json({
      error: "Unable to change password",
    });
  }
});

// --------------------------------------------------
// VERIFY EMAIL
// --------------------------------------------------

router.post("/verify-email/:token", async (req, res) => {
  try {
    const hashed = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        error: "This verification link is invalid or has expired",
      });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "Email verified. You can sign in now.",
    });
  } catch (err) {
    console.error("[auth verify-email]", err);
    res.status(500).json({ error: "Unable to verify email" });
  }
});


// --------------------------------------------------
// RESEND VERIFICATION
// --------------------------------------------------

router.post("/resend-verification", async (req, res) => {
  try {
    const user = await User.findOne({
      email: req.body.email?.trim().toLowerCase(),
    });

    if (user && !user.emailVerified) {
      await issueVerification(user);
    }

    res.json({
      success: true,
      message:
        "If that account needs verification, a new link has been sent.",
    });
  } catch (err) {
    console.error("[auth resend-verification]", err);
    res.status(500).json({ error: "Unable to send verification email" });
  }
});

export default router;