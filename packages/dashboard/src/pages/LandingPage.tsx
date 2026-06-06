import {
  Activity,
  ArrowRight,
  BookOpen,
  GitBranch,
  Hexagon,
  LayoutDashboard,
  Play,
  Rocket,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="bg-neutral-950 text-neutral-50 flex w-full h-screen overflow-hidden">
      {/* Sticky Sidebar — no user info, public-facing nav only */}
      <aside className="hidden md:flex shrink-0 bg-neutral-900 border-r border-white/10 px-5 py-6 flex-col w-[200px] h-full select-none">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="size-8 bg-[oklch(0.488_0.243_264.376)]/20 border border-[oklch(0.488_0.243_264.376)]/40 shadow-[0_0_16px_oklch(0.488_0.243_264.376/0.4)] rounded-lg flex justify-center items-center shrink-0">
            <Hexagon className="size-4 text-[oklch(0.6_0.2_264)]" />
          </div>
          <div className="leading-none flex flex-col overflow-hidden">
            <span className="font-bold text-sm leading-5 tracking-tight whitespace-nowrap">
              FLOW<span className="text-[oklch(0.6_0.2_264)]">FORGE</span>
            </span>
            <span className="text-[#6b6b6b] text-[9px] tracking-[2.5px] mt-0.5 whitespace-nowrap">
              ENGINE CONSOLE
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex mt-8 flex-col items-start gap-0.5">
          <Link
            to="/workflows"
            className="transition-colors rounded-lg text-[#a1a1a1] hover:text-neutral-50 hover:bg-neutral-800/50 text-sm flex px-3 py-2 items-center gap-3 w-full"
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span>Dashboard</span>
          </Link>
          <Link
            to="/workflows"
            className="transition-colors rounded-lg text-[#a1a1a1] hover:text-neutral-50 hover:bg-neutral-800/50 text-sm flex px-3 py-2 items-center gap-3 w-full"
          >
            <GitBranch className="size-4 shrink-0" />
            <span>Workflows</span>
          </Link>
          <Link
            to="/runs"
            className="transition-colors rounded-lg text-[#a1a1a1] hover:text-neutral-50 hover:bg-neutral-800/50 text-sm flex px-3 py-2 items-center gap-3 w-full"
          >
            <Play className="size-4 shrink-0" />
            <span>Runs</span>
          </Link>
        </nav>

        {/* Version tag at bottom */}
        <div className="mt-auto">
          <span className="text-[#555] text-[9px] tracking-[2.5px]">
            FLOWFORGE V0.1.0
          </span>
        </div>
      </aside>

      {/* Main scrollable area */}
      <main className="flex-1 flex flex-col overflow-y-auto min-w-0">
        {/* Hero Banner */}
        <section className="relative border-b border-white/10 w-full flex items-center overflow-hidden shrink-0" style={{ minHeight: '46vh' }}>
          <img
            alt="network"
            className="object-cover opacity-30 absolute inset-0 w-full h-full"
            src="https://images.unsplash.com/photo-1644088379091-d574269d422f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3ODc2NDd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBuZXR3b3JrJTIwbm9kZXMlMjBkYXRhJTIwZmxvdyUyMHRlY2hub2xvZ3l8ZW58MXwwfHx8MTc4MDQ4MjA5NXww&ixlib=rb-4.1.0&q=80&w=1200"
          />
          <div className="bg-[linear-gradient(to_right,oklch(0.1_0_0)_15%,oklch(0.1_0_0/0.85)_55%,oklch(0.1_0_0/0.4)_100%)] absolute inset-0" />

          <div className="relative w-full flex px-8 md:px-10 flex-col justify-center py-10 h-full">
            <div className="inline-flex bg-[oklch(0.488_0.243_264.376)]/15 border border-[oklch(0.488_0.243_264.376)]/30 text-[oklch(0.7_0.18_264)] font-medium rounded-full text-[11px] leading-4 mb-4 px-3 py-1 self-start items-center gap-2">
              <span className="size-1.5 bg-[oklch(0.696_0.17_162.48)] animate-pulse rounded-full" />
              Distributed Job Orchestration Engine
            </div>

            <h1 className="font-bold text-2xl md:text-[2.1rem] md:leading-[1.2] tracking-tight max-w-xl">
              Schedule, run &amp; scale{" "}
              <span className="text-[oklch(0.6_0.2_264)]">distributed jobs</span>{" "}
              with zero ops overhead.
            </h1>

            <p className="max-w-[500px] leading-relaxed text-[#a1a1a1] text-sm mt-4">
              FlowForge orchestrates resilient DAG pipelines across your worker
              cluster — with transactional task dependencies, automatic retries,
              and real-time telemetry.
            </p>

            <div className="flex mt-6 items-center gap-3 flex-wrap">
              <Button asChild className="bg-[oklch(0.55_0.2_264)] hover:bg-[oklch(0.55_0.2_264)]/90 shadow-[0_0_20px_oklch(0.55_0.2_264/0.3)] rounded-lg text-white px-5 gap-2 h-9 cursor-pointer text-sm font-medium">
                <Link to="/workflows">
                  <Rocket className="size-3.5" />
                  Get Started Free
                </Link>
              </Button>
              <Button
                asChild
                className="rounded-lg bg-neutral-900/60 hover:bg-neutral-800/50 border border-white/10 px-5 gap-2 h-9 cursor-pointer text-sm font-medium"
                variant="outline"
              >
                <a href="https://app.mintlify.com/anuj-fe65eb23/anuj-fe65eb23" target="_blank" rel="noopener noreferrer">
                  <BookOpen className="size-3.5" />
                  Read the Docs
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Features + CTA */}
        <section className="px-8 md:px-10 py-8 flex flex-col gap-6">
          {/* 3 Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-neutral-900/80 border border-white/10 p-5 flex flex-col gap-3">
              <CardHeader className="p-0 gap-3">
                <div className="size-9 bg-[oklch(0.488_0.243_264.376)]/15 rounded-lg flex justify-center items-center shrink-0">
                  <GitBranch className="size-4 text-[oklch(0.6_0.2_264)]" />
                </div>
                <span className="font-semibold text-sm leading-5">Visual DAG Builder</span>
              </CardHeader>
              <CardContent className="p-0">
                <p className="leading-relaxed text-[#a1a1a1] text-xs">
                  Compose complex task dependency graphs with a drag-and-drop editor and live validation.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-neutral-900/80 border border-white/10 p-5 flex flex-col gap-3">
              <CardHeader className="p-0 gap-3">
                <div className="size-9 bg-[oklch(0.696_0.17_162.48)]/15 rounded-lg flex justify-center items-center shrink-0">
                  <ShieldCheck className="size-4 text-[oklch(0.696_0.17_162.48)]" />
                </div>
                <span className="font-semibold text-sm leading-5">Resilient Execution</span>
              </CardHeader>
              <CardContent className="p-0">
                <p className="leading-relaxed text-[#a1a1a1] text-xs">
                  Automatic retries, dead-letter queues, and lease-based fault tolerance keep jobs running.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-neutral-900/80 border border-white/10 p-5 flex flex-col gap-3">
              <CardHeader className="p-0 gap-3">
                <div className="size-9 bg-[oklch(0.769_0.188_70.08)]/15 rounded-lg flex justify-center items-center shrink-0">
                  <Activity className="size-4 text-[oklch(0.769_0.188_70.08)]" />
                </div>
                <span className="font-semibold text-sm leading-5">Real-Time Telemetry</span>
              </CardHeader>
              <CardContent className="p-0">
                <p className="leading-relaxed text-[#a1a1a1] text-xs">
                  Stream live gateway events, monitor queue depth, and track worker health as it happens.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quickstart + CTA Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Quickstart Terminal */}
            <Card className="lg:col-span-7 bg-neutral-900/80 border border-white/10 p-5 flex flex-col gap-4">
              <CardHeader className="p-0 flex flex-row justify-between items-center gap-2">
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-[oklch(0.6_0.2_264)] shrink-0" />
                  <span className="font-semibold text-sm">Spin up a worker in seconds</span>
                </div>
                <span className="text-[#555] text-[10px] tracking-widest font-mono shrink-0">QUICKSTART</span>
              </CardHeader>
              <CardContent className="p-0 flex flex-col gap-4">
                <div className="bg-neutral-950 leading-relaxed font-mono rounded-lg text-xs border border-white/5 p-4">
                  <p className="text-[#a1a1a1]"># Install the FlowForge CLI</p>
                  <p className="text-[oklch(0.696_0.17_162.48)]">$ npm install -g flowforge</p>
                  <p className="text-[#a1a1a1] mt-2"># Launch a local task daemon</p>
                  <p className="text-[oklch(0.696_0.17_162.48)]">$ flowforge worker --concurrency 8</p>
                  <p className="text-[oklch(0.769_0.188_70.08)] mt-2">✓ Worker connected to gateway · listening for steps</p>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex flex-col">
                    <span className="font-bold text-lg leading-6">99.99%</span>
                    <span className="text-[#a1a1a1] text-[11px]">Scheduling uptime</span>
                  </div>
                  <div className="bg-white/10 w-px h-7 hidden sm:block" />
                  <div className="flex flex-col">
                    <span className="font-bold text-lg leading-6">12M+</span>
                    <span className="text-[#a1a1a1] text-[11px]">Jobs dispatched daily</span>
                  </div>
                  <div className="bg-white/10 w-px h-7 hidden sm:block" />
                  <div className="flex flex-col">
                    <span className="font-bold text-lg leading-6">{`<5ms`}</span>
                    <span className="text-[#a1a1a1] text-[11px]">Dispatch latency</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CTA Card */}
            <Card className="lg:col-span-5 relative border border-[oklch(0.55_0.2_264)]/30 bg-neutral-900/80 p-5 flex flex-col gap-4 overflow-hidden justify-between">
              <div className="size-40 bg-[oklch(0.488_0.243_264.376)]/20 blur-3xl rounded-full absolute -right-12 -top-12 pointer-events-none" />
              <CardHeader className="p-0 gap-3">
                <div className="size-9 bg-[oklch(0.55_0.2_264)] shadow-[0_0_18px_oklch(0.55_0.2_264/0.5)] rounded-lg flex justify-center items-center self-start shrink-0">
                  <Zap className="size-4 text-white" />
                </div>
                <span className="font-semibold text-base leading-6">Ready to forge your first pipeline?</span>
              </CardHeader>
              <CardContent className="p-0 flex flex-col gap-3">
                <p className="leading-relaxed text-[#a1a1a1] text-xs">
                  Open the console, register a workflow DAG, and start dispatching distributed job runs in minutes.
                </p>
                <div className="flex flex-col gap-2">
                  <Button asChild className="bg-[oklch(0.55_0.2_264)] hover:bg-[oklch(0.55_0.2_264)]/90 text-white rounded-lg justify-between w-full h-9 cursor-pointer text-sm font-medium">
                    <Link to="/workflows">
                      <span className="flex items-center gap-2">
                        <GitBranch className="size-4" />
                        Create a Workflow
                      </span>
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    className="bg-transparent hover:bg-neutral-800/40 rounded-lg border border-white/10 justify-between w-full h-9 cursor-pointer text-sm font-medium"
                    variant="outline"
                  >
                    <Link to="/dashboard">
                      <span className="flex items-center gap-2">
                        <LayoutDashboard className="size-4" />
                        Open Dashboard
                      </span>
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
