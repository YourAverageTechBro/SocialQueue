import Link from "next/link";

import { EnvelopeIcon } from "@heroicons/react/24/solid";
import { Container } from "./Container";
import Image from "next/image";
import logo from "./images/logos/social queue logo.png";

export function Footer() {
  return (
    <footer className="bg-slate-50">
      {/*@ts-ignore*/}
      <Container>
        <div className="py-16">
          {/*<Logo className="mx-auto h-10 w-auto" />*/}
          <div className={"flex justify-center"}>
            <Image src={logo} alt="" width={150} height={32} unoptimized />
          </div>
          <nav className="mt-10 text-sm" aria-label="quick links">
            <div className="-my-1 flex justify-center gap-x-6">
              <Link href="#features">Features</Link>
            </div>
          </nav>
        </div>
        <div className="flex flex-col items-center border-t border-slate-400/10 py-10 sm:flex-row-reverse sm:justify-between">
          <div className="flex gap-x-6">
            <Link
              href="https://thomasdohyunkim.notion.site/Privacy-Policy-7de98d782dd244768fc9b9ef6abfb319"
              className="group"
              aria-label={"privacy policy"}
            >
              Privacy Policy
            </Link>
            <Link
              href="https://thomasdohyunkim.notion.site/SWE-Projects-Terms-Of-Service-b4ac629fd20f47a88291111091676c16"
              className="group"
              aria-label={"terms of service"}
            >
              Terms of Service
            </Link>
            <Link
              href="mailto:dohyun@youraveragebro.com"
              className="group"
              aria-label={"email customer support"}
            >
              <EnvelopeIcon className={"h-6 w-6 text-gray-500"} />
            </Link>
          </div>
          <p className="mt-6 text-sm text-slate-500 sm:mt-0">
            Copyright &copy; {new Date().getFullYear()} SWEProjects. All rights
            reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
