
import { useState } from "react";
import Swal from "sweetalert2";
import {
  loginUser,
  registerUser,
} from "../services/auth";

import {
  Database,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  User,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Zap,
} from "lucide-react";

import "./Auth.css";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    confirm_password: "",
  });

  const isRegister = mode === "register";

  const updateField = (event) => {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setShowPassword(false);

    setForm({
      username: "",
      email: "",
      first_name: "",
      last_name: "",
      password: "",
      confirm_password: "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isRegister && form.password !== form.confirm_password) {
      await Swal.fire({
        icon: "warning",
        title: "Password mismatch",
        text: "Your passwords do not match. Please try again.",
        confirmButtonColor: "#922e40",
        background: "#171213",
        color: "#f7f0f1",
      });
      return;
    }

    setLoading(true);

    try {
      const result = isRegister
        ? await registerUser(form)
        : await loginUser({
            username: form.username,
            password: form.password,
          });

      if (!result.success || !result.user) {
        throw new Error(result.error || "Authentication failed.");
      }

      await Swal.fire({
        icon: "success",
        title: isRegister ? "Account Created!" : "Welcome Back!",
        text: isRegister
          ? "Your Cognify Data account is ready."
          : `Welcome ${result.user.full_name || result.user.username}!`,
        confirmButtonText: "Continue",
        confirmButtonColor: "#922e40",
        background: "#171213",
        color: "#f7f0f1",
        timer: 1800,
        timerProgressBar: true,
      });

      onAuthenticated(result.user);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: isRegister ? "Registration Failed" : "Login Failed",
        text: error.message || "Something went wrong. Please try again.",
        confirmButtonColor: "#922e40",
        background: "#171213",
        color: "#f7f0f1",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-page ${isRegister ? "register-mode" : "login-mode"}`}>
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <div className="auth-grid-pattern" />

      <div className={`auth-layout ${isRegister ? "register-layout" : "login-layout"}`}>

        {/* LEFT BRAND SECTION */}
        <section className="auth-showcase">
          <div className="showcase-brand">
            <div className="showcase-logo">
              <Database size={27} />
            </div>
            <span>Cognify<span className="brand-highlight">Data</span></span>
          </div>

          <div className="showcase-content">
            <span className="showcase-tag">
              <Sparkles size={14} />
              INTELLIGENCE REDEFINED
            </span>

            <h1>
              Turn your data
              <br />
              into <span>decisions.</span>
            </h1>

            <p>
              Connect your databases, analyze information, discover patterns
              and unlock powerful insights with AI.
            </p>

            <div className="showcase-features">
              <div>
                <div className="feature-icon"><Zap size={17} /></div>
                <span>AI-powered analytics</span>
              </div>

              <div>
                <div className="feature-icon"><Database size={17} /></div>
                <span>Multiple database connectors</span>
              </div>

              <div>
                <div className="feature-icon"><ShieldCheck size={17} /></div>
                <span>Your own secure workspace</span>
              </div>
            </div>
          </div>

          <div className="showcase-bottom">
            <span>DATA · INTELLIGENCE · INNOVATION</span>
            <span>01 / 02</span>
          </div>
        </section>

        {/* AUTH SECTION */}
        <section className="auth-panel" key={mode}>
          <div className="auth-panel-top">
            <span className="auth-panel-label">
              {isRegister ? "GET STARTED" : "WELCOME BACK"}
            </span>

            <span className="auth-status">
              <span />
              SYSTEM ONLINE
            </span>
          </div>

          <div className="auth-heading">
            <h2>
              {isRegister ? "Create account" : "Sign in"}
              <span>.</span>
            </h2>

            <p>
              {isRegister
                ? "Build your workspace. Start your data journey."
                : "Your data workspace is waiting for you."}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={!isRegister ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Sign In
            </button>

            <button
              type="button"
              className={isRegister ? "active" : ""}
              onClick={() => switchMode("register")}
            >
              Create Account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <div className="auth-name-row">
                  <div className="auth-input-group">
                    <label>First Name</label>
                    <div className="auth-input-wrapper">
                      <User size={17} />
                      <input
                        name="first_name"
                        placeholder="First name"
                        value={form.first_name}
                        onChange={updateField}
                        required
                      />
                    </div>
                  </div>

                  <div className="auth-input-group">
                    <label>Last Name</label>
                    <div className="auth-input-wrapper">
                      <User size={17} />
                      <input
                        name="last_name"
                        placeholder="Last name"
                        value={form.last_name}
                        onChange={updateField}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-input-group">
                  <label>Email Address</label>
                  <div className="auth-input-wrapper">
                    <Mail size={17} />
                    <input
                      type="email"
                      name="email"
                      placeholder="name@example.com"
                      value={form.email}
                      onChange={updateField}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="auth-input-group">
              <label>{isRegister ? "Username" : "Username or Email"}</label>
              <div className="auth-input-wrapper">
                <User size={17} />
                <input
                  name="username"
                  placeholder={
                    isRegister ? "Choose a username" : "Enter username or email"
                  }
                  value={form.username}
                  onChange={updateField}
                  required
                />
              </div>
            </div>

            <div className="auth-input-group">
              <label>Password</label>
              <div className="auth-input-wrapper">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={updateField}
                  required
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {isRegister && (
              <div className="auth-input-group">
                <label>Confirm Password</label>
                <div className="auth-input-wrapper">
                  <LockKeyhole size={17} />
                  <input
                    type="password"
                    name="confirm_password"
                    placeholder="Re-enter your password"
                    value={form.confirm_password}
                    onChange={updateField}
                    required
                  />
                </div>
              </div>
            )}

            {!isRegister && (
              <div className="auth-extra-row">
                <span><ShieldCheck size={14} /> Secure session</span>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              <span>
                {loading
                  ? "Please wait..."
                  : isRegister
                    ? "Create My Account"
                    : "Continue to Workspace"}
              </span>

              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="auth-switch-text">
            {isRegister ? "Already have an account?" : "New to Cognify Data?"}

            <button
              type="button"
              onClick={() => switchMode(isRegister ? "login" : "register")}
            >
              {isRegister ? "Sign in" : "Create an account"}
            </button>
          </div>

          <div className="auth-panel-footer">
            <span>© {new Date().getFullYear()} Cognify Data</span>
            <span>BUILT FOR BETTER DECISIONS</span>
          </div>
        </section>
      </div>
    </div>
  );
}
