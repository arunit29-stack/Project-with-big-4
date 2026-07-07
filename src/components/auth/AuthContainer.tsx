"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

interface AuthContainerProps {
  initialMode: "login" | "signup";
}

export function AuthContainer({ initialMode }: AuthContainerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [visibleSide, setVisibleSide] = useState<"login" | "signup">(initialMode);
  const [isFlipping, setIsFlipping] = useState(false);

  // Sync mode if initialMode prop changes (e.g. user uses browser back/forward buttons)
  useEffect(() => {
    setMode(initialMode);
    setVisibleSide(initialMode);
  }, [initialMode]);

  const handleToggle = (e: React.MouseEvent, targetMode: "login" | "signup") => {
    e.preventDefault();
    if (isFlipping || mode === targetMode) return;

    setIsFlipping(true);
    setMode(targetMode);

    // Swap visibility halfway through the 3D rotation (when card is 90 deg / edge-on)
    setTimeout(() => {
      setVisibleSide(targetMode);
    }, 300);

    // Smoothly update the URL path without a full page refresh
    setTimeout(() => {
      router.push(targetMode === "login" ? "/login" : "/signup", { scroll: false });
      setIsFlipping(false);
    }, 600); // matches the 0.6s CSS transition
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-emerald-50/50 font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900 flex flex-col justify-between">
      
      {/* Dynamic Animated Grid Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-60 animate-pulse"
        style={{ animationDuration: "8s" }}
      />

      {/* Floating Animated Academic Objects */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Floating Book */}
        <div className="absolute left-[10%] top-[25%] animate-float duration-[7s] opacity-60">
          <svg className="h-10 w-10 text-indigo-400/70 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        </div>

        {/* Floating Graduation Cap */}
        <div className="absolute right-[12%] top-[20%] animate-float duration-[8s] delay-1000 opacity-60">
          <svg className="h-12 w-12 text-blue-400/60 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A57.414 57.414 0 0 0 12 15.75a57.414 57.414 0 0 0 5.25-4.425v3.675" />
          </svg>
        </div>

        {/* Floating Science Icon */}
        <div className="absolute left-[12%] bottom-[20%] animate-float duration-[9s] delay-500 opacity-60">
          <svg className="h-12 w-12 text-emerald-400/70 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-8.813-8.813M9 21L17.813 12.188M12.188 17.813L21 9m0 0l-8.813-8.813M21 9L12.188 17.813" />
            <circle cx="12" cy="12" r="3" strokeWidth="2" />
          </svg>
        </div>

        {/* Ambient Light Blobs */}
        <div className="absolute left-[15%] top-[15%] -z-10 h-64 w-64 rounded-full bg-blue-300/20 blur-3xl filter animate-blob" />
        <div className="absolute right-[20%] bottom-[15%] -z-10 h-80 w-80 rounded-full bg-emerald-200/15 blur-3xl filter animate-blob animation-delay-2000" />
      </div>

      {/* Global CSS for Float and 3D Card Flip */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes blob {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(20px, -20px) scale(1.05); }
          66% { transform: translate(-10px, 10px) scale(0.98); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-blob {
          animation: blob 10s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        /* 3D Card Flip Styles */
        .perspective-container {
          perspective: 1200px;
        }
        .flip-card-inner {
          position: relative;
          width: 100%;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .is-flipped {
          transform: rotateY(180deg);
        }
        .flip-card-front, .flip-card-back {
          position: absolute;
          width: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .flip-card-back {
          transform: rotateY(180deg);
        }
      `}</style>

      {/* Header containing CBB Logo */}
      <header className="relative z-10 mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center group cursor-pointer">
          <svg className="h-12 w-36 transition-transform duration-300 group-hover:scale-105" viewBox="0 0 280 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cyan-blue-grad-auth" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
            </defs>
            <path d="M 44 72 V 80 H 52 V 72" stroke="url(#cyan-blue-grad-auth)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <rect x="28" y="80" width="40" height="6" rx="3" stroke="url(#cyan-blue-grad-auth)" strokeWidth="3" fill="none" />
            <rect x="14" y="22" width="70" height="50" rx="5" stroke="url(#cyan-blue-grad-auth)" strokeWidth="3" fill="none" />
            <circle cx="19" cy="29" r="1.5" fill="url(#cyan-blue-grad-auth)" />
            <line x1="19" y1="35" x2="19" y2="58" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2.5" strokeLinecap="round" />

            {/* AI Chip */}
            <rect x="41" y="39" width="16" height="16" rx="3" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2.5" fill="#ffffff" />
            <path d="M 49 42 L 51 47 L 56 49 L 51 51 L 49 56 L 47 51 L 42 49 L 47 47 Z" fill="url(#cyan-blue-grad-auth)" />
            <path d="M 41 47 H 32 C 30 47, 28 45, 28 43" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M 57 47 H 66 C 68 47, 70 49, 70 51" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M 49 39 V 30 C 49 28, 51 26, 53 26" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M 49 55 V 64 C 49 66, 47 68, 45 68" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <circle cx="28" cy="43" r="2.5" fill="url(#cyan-blue-grad-auth)" />
            <circle cx="70" cy="51" r="2.5" fill="url(#cyan-blue-grad-auth)" />
            <circle cx="53" cy="26" r="2.5" fill="url(#cyan-blue-grad-auth)" />
            <circle cx="45" cy="68" r="2.5" fill="url(#cyan-blue-grad-auth)" />

            {/* CBB Font layers */}
            <text x="100" y="68" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="101" y="67" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="102" y="66" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="103" y="65" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="104" y="64" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="105" y="63" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="106" y="62" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="107" y="61" fill="url(#cyan-blue-grad-auth)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="108" y="60" fill="#ffffff" stroke="url(#cyan-blue-grad-auth)" strokeWidth="2" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
            <text x="160" y="88" textAnchor="middle" fill="url(#cyan-blue-grad-auth)" fontSize="11" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" letterSpacing="1.2">CLASSROOM BUT BETTER</text>
          </svg>
        </Link>
        <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
          &larr; Back to Home
        </Link>
      </header>

      {/* Main 3D Card Area */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 perspective-container">
        {/* Fix container heights depending on active card mode to avoid layout jumping */}
        <div className="relative w-full max-w-md" style={{ minHeight: mode === "login" ? "490px" : "670px", transition: "min-height 0.4s ease" }}>
          
          <div className={`flip-card-inner ${mode === "signup" ? "is-flipped" : ""}`}>
            
            {/* Front Card Face: Login */}
            <div className={`flip-card-front ${visibleSide !== "login" ? "invisible" : ""}`}>
              <div className="w-full rounded-2xl border border-white/50 bg-white/30 p-8 shadow-2xl shadow-blue-500/10 backdrop-blur-xl">
                <LoginForm />
                <div className="mt-6 text-center text-sm text-slate-600">
                  Don't have an account?{" "}
                  <a 
                    href="/signup" 
                    onClick={(e) => handleToggle(e, "signup")}
                    className="font-bold text-blue-600 hover:text-blue-700 transition-colors pointer-events-auto cursor-pointer"
                  >
                    Sign Up
                  </a>
                </div>
              </div>
            </div>

            {/* Back Card Face: Signup */}
            <div className={`flip-card-back ${visibleSide !== "signup" ? "invisible" : ""}`}>
              <div className="w-full rounded-2xl border border-white/50 bg-white/30 p-8 shadow-2xl shadow-blue-500/10 backdrop-blur-xl">
                <SignupForm />
                <div className="mt-6 text-center text-sm text-slate-600">
                  Already have an account?{" "}
                  <a 
                    href="/login" 
                    onClick={(e) => handleToggle(e, "login")}
                    className="font-semibold text-blue-600 hover:text-blue-500 transition-colors pointer-events-auto cursor-pointer"
                  >
                    Sign In
                  </a>
                </div>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} Classroom But Better. All rights reserved.
      </footer>
    </div>
  );
}
