"use client";
import dynamic from "next/dynamic";

const CityStage = dynamic(() => import("../components/CityStage"), { ssr: false });

export default function Home() {
  return <CityStage />;
}
