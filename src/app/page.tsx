"use client";

import { useAuth } from "@/contexts/AuthContext";
import { homeRouteForRole } from "@/lib/auth/redirects";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function HomePage() {
  const { status, user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(homeRouteForRole(user.role));
    }
  }, [status, user, router]);

  // If authenticated, show loading spinner while redirecting
  if (status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500 animate-pulse">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Show a clean loading state until client mount and auth status are resolved
  if (!mounted || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-emerald-50/50 font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      
      {/* Dynamic Animated Grid Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-60"
        style={{
          animation: "pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite"
        }}
      />

      {/* Floating Animated Academic Objects */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        
        {/* Floating Book SVG */}
        <div className="absolute left-[8%] top-[20%] animate-float duration-[6s] opacity-70">
          <svg className="h-12 w-12 text-indigo-400/80 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        </div>

        {/* Floating Graduation Cap SVG */}
        <div className="absolute right-[10%] top-[15%] animate-float duration-[8s] delay-1000 opacity-60">
          <svg className="h-16 w-16 text-blue-400/70 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A57.414 57.414 0 0 0 12 15.75a57.414 57.414 0 0 0 5.25-4.425v3.675" />
          </svg>
        </div>

        {/* Floating Atomic/Science Icon SVG */}
        <div className="absolute left-[15%] bottom-[15%] animate-float duration-[7s] delay-500 opacity-70">
          <svg className="h-14 w-14 text-emerald-400/80 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-8.813-8.813M9 21L17.813 12.188M12.188 17.813L21 9m0 0l-8.813-8.813M21 9L12.188 17.813" />
            <circle cx="12" cy="12" r="3" strokeWidth="2" />
          </svg>
        </div>

        {/* Floating Lightbulb Idea SVG */}
        <div className="absolute right-[12%] bottom-[20%] animate-float duration-[9s] delay-1500 opacity-60">
          <svg className="h-14 w-14 text-amber-400/80 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3m0 0h.01m-1.993-3h3.986a3 3 0 0 0 3-3V9a7.5 7.5 0 1 0-15 0v3a3 3 0 0 0 3 3Zm3-9a3 3 0 1 1-6 0v0a3 3 0 0 1 6 0Z" />
          </svg>
        </div>

        {/* Soft Ambient Light Blobs */}
        <div className="absolute left-[10%] top-[10%] -z-10 h-72 w-72 rounded-full bg-blue-300/25 blur-3xl filter animate-blob" />
        <div className="absolute right-[15%] bottom-[10%] -z-10 h-96 w-96 rounded-full bg-emerald-200/20 blur-3xl filter animate-blob animation-delay-2000" />
        <div className="absolute left-[40%] top-[40%] -z-10 h-80 w-80 rounded-full bg-indigo-200/25 blur-3xl filter animate-blob animation-delay-4000" />
      </div>

      {/* Styles for Custom Animations */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(3deg); }
        }
        @keyframes blob {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
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
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>

      {/* Header / Navbar */}
      <header className="relative z-10 mx-auto max-w-7xl px-6 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center group cursor-default">
            <svg className="h-14 w-44 transition-transform duration-300 group-hover:scale-105" viewBox="0 0 280 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="cyan-blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
              </defs>
              
              {/* Monitor Stand neck */}
              <path d="M 44 72 V 80 H 52 V 72" stroke="url(#cyan-blue-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {/* Monitor Stand base */}
              <rect x="28" y="80" width="40" height="6" rx="3" stroke="url(#cyan-blue-grad)" strokeWidth="3" fill="none" />
              
              {/* Monitor Screen Frame */}
              <rect x="14" y="22" width="70" height="50" rx="5" stroke="url(#cyan-blue-grad)" strokeWidth="3" fill="none" />
              {/* Left side decoration details (bezel details) */}
              <circle cx="19" cy="29" r="1.5" fill="url(#cyan-blue-grad)" />
              <line x1="19" y1="35" x2="19" y2="58" stroke="url(#cyan-blue-grad)" strokeWidth="2.5" strokeLinecap="round" />

              {/* AI/Neural-Network processor and circuit pathways inside screen */}
              {/* Central AI Chip */}
              <rect x="41" y="39" width="16" height="16" rx="3" stroke="url(#cyan-blue-grad)" strokeWidth="2.5" fill="#ffffff" />
              {/* Core AI Spark */}
              <path d="M 49 42 L 51 47 L 56 49 L 51 51 L 49 56 L 47 51 L 42 49 L 47 47 Z" fill="url(#cyan-blue-grad)" />
              {/* Circuit tracks */}
              <path d="M 41 47 H 32 C 30 47, 28 45, 28 43" stroke="url(#cyan-blue-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M 57 47 H 66 C 68 47, 70 49, 70 51" stroke="url(#cyan-blue-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M 49 39 V 30 C 49 28, 51 26, 53 26" stroke="url(#cyan-blue-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M 49 55 V 64 C 49 66, 47 68, 45 68" stroke="url(#cyan-blue-grad)" strokeWidth="2" strokeLinecap="round" fill="none" />
              {/* Connection Nodes */}
              <circle cx="28" cy="43" r="2.5" fill="url(#cyan-blue-grad)" />
              <circle cx="70" cy="51" r="2.5" fill="url(#cyan-blue-grad)" />
              <circle cx="53" cy="26" r="2.5" fill="url(#cyan-blue-grad)" />
              <circle cx="45" cy="68" r="2.5" fill="url(#cyan-blue-grad)" />

              {/* 3D Extrusion effect for CBB */}
              <text x="100" y="68" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="101" y="67" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="102" y="66" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="103" y="65" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="104" y="64" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="105" y="63" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="106" y="62" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              <text x="107" y="61" fill="url(#cyan-blue-grad)" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>
              
              {/* Front white face of CBB */}
              <text x="108" y="60" fill="#ffffff" stroke="url(#cyan-blue-grad)" strokeWidth="2" fontSize="58" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" letterSpacing="-1">CBB</text>

              {/* CLASSROOM BUT BETTER text underneath CBB */}
              <text x="160" y="88" textAnchor="middle" fill="url(#cyan-blue-grad)" fontSize="11" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" letterSpacing="1.2">CLASSROOM BUT BETTER</text>
            </svg>
          </div>

          {/* Login and Signup Action Buttons */}
          <nav className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors duration-200"
            >
              Log In
            </Link>
            <Link 
              href="/signup" 
              className="flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-blue-700 hover:shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
            >
              Sign Up
            </Link>
          </nav>

        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-24 sm:px-8 sm:pt-24 lg:pt-32">
        <div className="flex flex-col items-center text-center">
          
          {/* Tagline / Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/50 px-4 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur-sm animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Empowering Modern Classrooms
          </div>

          {/* Hero Heading */}
          <h1 className="mt-8 max-w-4xl text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl md:text-7xl leading-none">
            Learn Smarter
            <span className="block mt-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 bg-clip-text text-transparent">
              Teach Better
            </span>
          </h1>

          {/* Hero Subheading */}
          <p className="mt-6 max-w-2xl text-lg text-slate-500 sm:text-xl leading-relaxed">
            An AI-powered academic suite built to transform document ingestion, automate smart quiz generation, and assist through real-time course chats.
          </p>

          {/* Core Call to Actions */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-xs sm:max-w-none">
            <Link 
              href="/signup" 
              className="flex w-full sm:w-auto items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 hover:shadow-indigo-600/35 transition-all duration-200 hover:-translate-y-0.5"
            >
              Get Started for Free
            </Link>
            <Link 
              href="/login" 
              className="flex w-full sm:w-auto items-center justify-center rounded-xl border border-slate-200 bg-white/80 px-8 py-4 text-base font-semibold text-slate-700 shadow-sm backdrop-blur-sm hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
            >
              Explore Dashboard
            </Link>
          </div>

          {/* Feature Grid */}
          <div className="mt-24 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 w-full">
            
            {/* Feature 1 */}
            <div className="group relative rounded-2xl border border-slate-100 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-blue-200 hover:-translate-y-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-800">Smart Document Ingestion</h3>
              <p className="mt-2 text-sm text-slate-500">Upload slides, docx, or PDFs and let our pipeline structure the materials seamlessly.</p>
            </div>

            {/* Feature 2 */}
            <div className="group relative rounded-2xl border border-slate-100 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-indigo-200 hover:-translate-y-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-8.813-8.813M9 21L17.813 12.188M12.188 17.813L21 9m0 0l-8.813-8.813M21 9L12.188 17.813" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-800">AI-Generated Quizzes</h3>
              <p className="mt-2 text-sm text-slate-500">Instantly generate high-quality quizzes tailored directly from your uploaded materials.</p>
            </div>

            {/* Feature 3 */}
            <div className="group relative rounded-2xl border border-slate-100 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-emerald-200 hover:-translate-y-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.92 1.786c-.085.126.036.273.178.235a8.216 8.216 0 0 0 3.328-1.57c.394-.282.883-.34 1.353-.25a8.91 8.91 0 0 0 2.202.25Z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-800">Interactive Course Chat</h3>
              <p className="mt-2 text-sm text-slate-500">Provide students with intelligent virtual assistants to answer course questions 24/7.</p>
            </div>

            {/* Feature 4 */}
            <div className="group relative rounded-2xl border border-slate-100 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-amber-200 hover:-translate-y-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors duration-300">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-800">Unified Class Insights</h3>
              <p className="mt-2 text-sm text-slate-500">Review detailed query logs, class status charts, and learning outcomes in real time.</p>
            </div>

          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-100/80 bg-white/40 py-8 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 text-center text-xs text-slate-400 sm:px-8">
          &copy; {new Date().getFullYear()} Classroom But Better. All rights reserved.
        </div>
      </footer>

    </div>
  );
}
