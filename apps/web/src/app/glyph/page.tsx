"use client";
import "./glyph-tokens.css";
import "./shell.css";
import dynamic from "next/dynamic";

// Dynamic import with ssr:false — Phaser is browser-only; without this the
// SSR pass tries to evaluate phaser.esm.js's window references and blows up.
const GlyphStage = dynamic(() => import("../../glyph/GlyphStage"), { ssr: false });

export default function GlyphPage() {
  return <GlyphStage />;
}
