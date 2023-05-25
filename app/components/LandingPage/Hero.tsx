import Link from "next/link";
import { Container } from "./Container";

export function Hero() {
  return (
    // @ts-ignore
    <Container className="pb-16 pt-20 text-center lg:pt-32">
      <h1 className="font-display mx-auto max-w-4xl text-4xl font-medium tracking-tight text-slate-900 sm:text-7xl">
        <span className="relative  text-blue-600">
          <span className="relative">
            Schedule your social media posts from Notion
          </span>
        </span>{" "}
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-2xl tracking-tight text-slate-700">
        Plan, create, and schedule your social media posts from within Notion.
      </p>
      <div className="mt-10 flex justify-center gap-x-6">
        {/*@ts-ignore*/}
        <Link
          href="/auth"
          className="rounded-full bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Get Started
        </Link>
      </div>
      <div className="mt-20 lg:mt-24"></div>
    </Container>
  );
}
